import type { createAdminClient } from './supabase/admin'
type Db = ReturnType<typeof createAdminClient>
type Owner = { id: string; assigned_to: string | null; assigned_to_member: string | null }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
const reply = (body: unknown, status = 200) => Response.json(body, {status,headers})

/** Continue until EMPTY, not a short page: the server may impose a lower max_rows. */
async function* pages<T extends {id: string}>(query: (after: string | null) => PromiseLike<{data: T[] | null; error: unknown}>) {
  let after: string | null = null
  for (;;) {
    const {data,error} = await query(after)
    if (error || !data) throw new Error('Read unavailable')
    if (!data.length) return
    const last = data[data.length-1].id
    if (!last || (after && last <= after)) throw new Error('Pagination unavailable')
    yield data
    after = last
  }
}
class Restricted extends Error {}

/** Owner-only, stricter than board sharing and historical-thread fallback. No impersonation. */
export function conversationOrderAPI(db: Db, caller: () => Promise<{id: string; authUserId: string} | null>) {
  return async (request: Request) => {
    try {
      const session = await caller()
      if (!session) return reply({error:'Unauthorized'},401)
      const params = new URL(request.url).searchParams
      if (!params.has('pipeline_id')) return reply({auth_user_id:session.authUserId})
      const pipelineId = params.get('pipeline_id')
      if (!pipelineId || !uuid.test(pipelineId)) return reply({error:'Invalid pipeline'},400)
      const {data:pipeline,error} = await db.from('pipelines').select('id').eq('id',pipelineId).eq('buyer_id',session.id).maybeSingle()
      if (error) throw error
      if (!pipeline) throw new Restricted()
      const conversations: {lead_id:string; last_whatsapp_at:string|null}[] = []
      for await (const batch of pages(after => {
        let q = db.from('pipeline_leads').select('id,lead:leads!inner(id,assigned_to,assigned_to_member)').eq('pipeline_id',pipelineId).order('id').limit(100)
        if (after) q=q.gt('id',after)
        return q
      })) {
        const owners = batch.map(p=>p.lead as unknown as Owner)
        if (owners.some(o=>!o?.id)) throw new Error('Missing lead')
        // Batch equivalent of getCurrentLeadOwner; a member without a buyer falls back
        // to assigned_to. Never call a per-lead auth helper (N+1).
        const members = [...new Set(owners.map(o=>o.assigned_to_member).filter((id): id is string => !!id))]
        const readMemberOwners = async () => {
          const memberOwners = new Map<string,string>()
          if (members.length) {
            for await (const memberBatch of pages(after=>{
              let q=db.from('team_members').select('id,auth_user_id').in('id',members).order('id').limit(100)
              if(after)q=q.gt('id',after)
              return q
            })) {
              const authIds=[...new Set(memberBatch.map(m=>m.auth_user_id).filter(Boolean))]
              if (!authIds.length) continue
              for await (const buyers of pages(after=>{
                let q=db.from('buyers').select('id,auth_user_id').in('auth_user_id',authIds).order('id').limit(100)
                if(after)q=q.gt('id',after)
                return q
              })) for (const member of memberBatch) {
                const buyer=buyers.find(b=>b.auth_user_id===member.auth_user_id)
                if(buyer)memberOwners.set(member.id,buyer.id)
              }
            }
          }
          return memberOwners
        }
        const memberOwners = await readMemberOwners()
        const owns = (lead: Owner) => (lead.assigned_to_member ? memberOwners.get(lead.assigned_to_member) || lead.assigned_to : lead.assigned_to) === session.id
        // Board visibility does not grant conversation access. Omit delegated IDs
        // before touching messages; an empty authorized subset is a valid result.
        const ids=[...new Set(owners.filter(owns).map(o=>o.id))]
        if (!ids.length) continue
        const seen=new Set<string>()
        const batchConversations: typeof conversations = []
        for await (const leads of pages(after=>{
          // PostgREST left embed: filter + ORDER/LIMIT apply PER LEAD. Only one
          // timestamp crosses the wire; idx_wa_msg_lead(lead_id,sent_at DESC) exists.
          // Writers materialize inbound as delivered, outbound as sent; read is
          // an acknowledgement, but its original sent_at remains unchanged.
          let q=db.from('leads').select('id,assigned_to,assigned_to_member,whatsapp_messages(sent_at)')
            .in('id',ids).eq('whatsapp_messages.buyer_id',session.id)
            .in('whatsapp_messages.direction',['in','out'])
            .in('whatsapp_messages.status',['sent','delivered','read'])
            .not('whatsapp_messages.sent_at','is',null)
            .order('sent_at',{referencedTable:'whatsapp_messages',ascending:false,nullsFirst:true})
            .limit(1,{referencedTable:'whatsapp_messages'}).order('id').limit(100)
          if(after)q=q.gt('id',after)
          return q
        })) for (const lead of leads) {
          // Recheck ownership fields returned alongside the timestamp. An assignment
          // changed during this read must fail closed, not reuse an old permission.
          const original=owners.find(o=>o.id===lead.id)
          if(!original || !ids.includes(lead.id)) throw new Error('Unexpected lead')
          seen.add(lead.id)
          if(original.assigned_to!==lead.assigned_to || (original.assigned_to_member||null)!==(lead.assigned_to_member||null) || !owns(lead)) continue
          if(!Array.isArray(lead.whatsapp_messages)) throw new Error('Missing relation')
          const date=lead.whatsapp_messages[0]?.sent_at
          batchConversations.push({lead_id:lead.id,last_whatsapp_at:typeof date==='string'&&Number.isFinite(Date.parse(date))?date:null})
        }
        if(seen.size!==ids.length) throw new Error('Incomplete read')
        // Member -> buyer may change without changing the lead fields. Re-resolve
        // after the metadata read. Revoked metadata is omitted, never changed to
        // an empty-thread date, and never invalidates unrelated authorized cards.
        // Database errors still discard the WHOLE response through the 503 path.
        const currentMemberOwners = await readMemberOwners()
        for (const conversation of batchConversations) {
          const owner=owners.find(o=>o.id===conversation.lead_id)!
          if (owner.assigned_to_member && currentMemberOwners.get(owner.assigned_to_member)!==memberOwners.get(owner.assigned_to_member)) continue
          conversations.push(conversation)
        }
      }
      return reply({auth_user_id:session.authUserId,pipeline_id:pipelineId,conversations})
    } catch (error) {
      return error instanceof Restricted ? reply({error:'Conversation owner access required'},403) : reply({error:'Conversations unavailable'},503)
    }
  }
}
