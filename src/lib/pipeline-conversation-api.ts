import type { createAdminClient } from './supabase/admin'
import { hasWhatsAppContent, isCustomerReply } from './wa-message-content'

const messageFields = 'id,sent_at,direction,body,media_type,media_url,wa_message_id'
type Message = { id: string; sent_at: string; direction: string; body?: string | null; media_type?: string | null; media_url?: string | null; wa_message_id?: string | null }
const isMessage = (row: Message) => row.direction === 'out' ? hasWhatsAppContent(row) : isCustomerReply(row)
const before = (row: Message, cursor: Message) => row.sent_at < cursor.sent_at || (row.sent_at === cursor.sent_at && row.id < cursor.id)

/** Only noisy top rows need history. Two simple keyset queries avoid an untested
 * compound PostgREST expression: finish timestamp ties, then read older dates.
 * Short pages are NOT exhaustion; max_rows may be smaller than our limit.
 * A bounded, incomplete search is unavailable (503), never an empty thread. */
async function previousMessage(db: Db, buyerId: string, leadId: string, first: Message, spend: () => void): Promise<string | null> {
  let cursor = first
  let ties = true
  for (let page = 0; page < 24; page++) {
    if (!cursor.id || !Number.isFinite(Date.parse(cursor.sent_at))) throw new Error('Invalid message cursor')
    spend()
    let q = db.from('whatsapp_messages').select(messageFields)
      .eq('buyer_id', buyerId).eq('lead_id', leadId)
      .in('direction', ['in','out']).in('status', ['sent','delivered','read'])
      .not('sent_at', 'is', null).order('sent_at', {ascending:false}).order('id', {ascending:false}).limit(32)
    q = ties ? q.eq('sent_at', cursor.sent_at).lt('id', cursor.id) : q.lt('sent_at', cursor.sent_at)
    const {data,error} = await q
    if (error || !data) throw new Error('History unavailable')
    const rows = data as unknown as Message[]
    if (!rows.length) {
      if (!ties) return null
      ties = false
      continue
    }
    let previous = cursor
    for (const row of rows) {
      if (!row.id || !Number.isFinite(Date.parse(row.sent_at)) || !before(row, previous) || (ties && row.sent_at !== cursor.sent_at)) throw new Error('History pagination unavailable')
      previous = row
    }
    const valid = rows.find(isMessage)
    if (valid) return valid.sent_at
    cursor = rows[rows.length - 1]
    ties = true
  }
  throw new Error('History search budget exceeded')
}
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
      let historyReads = 0
      const spendHistoryRead = () => { if (++historyReads > 64) throw new Error('History request budget exceeded') }
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
        const historyIds: string[] = []
        for await (const leads of pages(after=>{
          // PostgREST left embed: filter + ORDER/LIMIT apply PER LEAD. One row
          // crosses the wire on the clean fast path; only noise needs more reads.
          // Writers materialize inbound as delivered, outbound as sent; read is
          // an acknowledgement, but its original sent_at remains unchanged.
          let q=db.from('leads').select(`id,assigned_to,assigned_to_member,whatsapp_messages(${messageFields})`)
            .in('id',ids).eq('whatsapp_messages.buyer_id',session.id)
            .in('whatsapp_messages.direction',['in','out'])
            .in('whatsapp_messages.status',['sent','delivered','read'])
            .not('whatsapp_messages.sent_at','is',null)
            .order('sent_at',{referencedTable:'whatsapp_messages',ascending:false,nullsFirst:true})
            .order('id',{referencedTable:'whatsapp_messages',ascending:false})
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
          const latest = lead.whatsapp_messages[0] as Message | undefined
          let date: string | null = null
          if (latest && typeof latest.sent_at === 'string' && Number.isFinite(Date.parse(latest.sent_at))) {
            if (isMessage(latest)) date = latest.sent_at
            else {
              historyIds.push(lead.id)
              date = await previousMessage(db, session.id, lead.id, latest, spendHistoryRead)
            }
          }
          batchConversations.push({lead_id:lead.id,last_whatsapp_at:date})
        }
        if(seen.size!==ids.length) throw new Error('Incomplete read')
        // Direct history reads extend the authorization window. Recheck only
        // those leads, in batches, AFTER history and before member revalidation.
        const rechecked = new Map<string, Owner>()
        if (historyIds.length) {
          for await (const leads of pages(after => {
            let q = db.from('leads').select('id,assigned_to,assigned_to_member').in('id',historyIds).order('id').limit(100)
            if (after) q = q.gt('id',after)
            return q
          })) for (const lead of leads) {
            if (!historyIds.includes(lead.id)) throw new Error('Unexpected lead')
            rechecked.set(lead.id,lead)
          }
          if (rechecked.size !== historyIds.length) throw new Error('Incomplete ownership read')
        }
        // Member -> buyer may change without changing the lead fields. Re-resolve
        // after the metadata read. Revoked metadata is omitted, never changed to
        // an empty-thread date, and never invalidates unrelated authorized cards.
        // Database errors still discard the WHOLE response through the 503 path.
        const currentMemberOwners = await readMemberOwners()
        for (const conversation of batchConversations) {
          const owner=owners.find(o=>o.id===conversation.lead_id)!
          const current = rechecked.get(owner.id)
          if (current && (current.assigned_to !== owner.assigned_to || (current.assigned_to_member||null) !== (owner.assigned_to_member||null) || !owns(current))) continue
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
