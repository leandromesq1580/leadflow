import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/buyer-leads-history?secret=X&email=Y
 *
 * Procura TODOS os leads que tiveram alguma interacao com o buyer:
 * - assigned_to atual
 * - assigned_to_member (qualquer team_member desse email)
 * - whatsapp_messages (qualquer msg pro buyer_id ou pro team_member buyer)
 * - follow_ups (criados pelo buyer)
 * - lead_activity (com buyer_id)
 * - archived (que ela arquivou)
 *
 * Util pra rastrear pra onde foram leads "antigos" mesmo apos mudanca de
 * assignment ou delete em pipeline_leads.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = url.searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const db = createAdminClient()

  const { data: buyer } = await db.from('buyers').select('id, name, email').ilike('email', email).maybeSingle()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  const { data: members } = await db.from('team_members').select('id, name, buyer_id').ilike('email', email)
  const memberIds = (members || []).map(m => m.id)

  const leadIdsSet = new Set<string>()
  const sources: Record<string, Set<string>> = {
    assigned_to_buyer: new Set(),
    assigned_to_member: new Set(),
    whatsapp_msgs_buyer: new Set(),
    whatsapp_msgs_via_members: new Set(),
    follow_ups_buyer: new Set(),
    lead_activity_buyer: new Set(),
    archived_by_buyer: new Set(),
  }

  // 1) assigned_to = buyer
  const { data: assignedNow } = await db.from('leads').select('id').eq('assigned_to', buyer.id).limit(2000)
  for (const l of assignedNow || []) { leadIdsSet.add(l.id); sources.assigned_to_buyer.add(l.id) }

  // 2) assigned_to_member em qualquer team_member desse email
  if (memberIds.length > 0) {
    const { data: assignedMember } = await db.from('leads').select('id').in('assigned_to_member', memberIds).limit(2000)
    for (const l of assignedMember || []) { leadIdsSet.add(l.id); sources.assigned_to_member.add(l.id) }
  }

  // 3) whatsapp_messages com buyer_id = buyer.id (atual ou histórico antes do reconcile)
  const { data: waBuyer } = await db.from('whatsapp_messages').select('lead_id').eq('buyer_id', buyer.id).not('lead_id', 'is', null).limit(5000)
  for (const m of waBuyer || []) { if (m.lead_id) { leadIdsSet.add(m.lead_id); sources.whatsapp_msgs_buyer.add(m.lead_id) } }

  // 4) whatsapp_messages via buyer_id da AGENCY (se member) — pra leads delegados
  if (members && members.length > 0) {
    const agencyBuyerIds = Array.from(new Set(members.map(m => m.buyer_id)))
    // ja temos leads via assigned_to_member acima; aqui pegamos msgs nessas conversas
    if (agencyBuyerIds.length > 0 && memberIds.length > 0) {
      const memberLeadIds = Array.from(sources.assigned_to_member)
      if (memberLeadIds.length > 0) {
        const { data: waAgency } = await db
          .from('whatsapp_messages')
          .select('lead_id')
          .in('buyer_id', agencyBuyerIds)
          .in('lead_id', memberLeadIds)
          .limit(5000)
        for (const m of waAgency || []) { if (m.lead_id) sources.whatsapp_msgs_via_members.add(m.lead_id) }
      }
    }
  }

  // 5) follow_ups criados pelo buyer
  const { data: fus } = await db.from('follow_ups').select('lead_id').eq('buyer_id', buyer.id).limit(2000)
  for (const f of fus || []) { leadIdsSet.add(f.lead_id); sources.follow_ups_buyer.add(f.lead_id) }

  // 6) lead_activity com buyer
  const { data: las } = await db.from('lead_activity').select('lead_id').eq('buyer_id', buyer.id).limit(2000)
  for (const a of las || []) { leadIdsSet.add(a.lead_id); sources.lead_activity_buyer.add(a.lead_id) }

  // 7) arquivados POR esse buyer
  const { data: arch } = await db.from('leads').select('id').eq('archived_by', buyer.id).limit(2000)
  for (const l of arch || []) { leadIdsSet.add(l.id); sources.archived_by_buyer.add(l.id) }

  // Pega info detalhada dos leads
  const ids = Array.from(leadIdsSet)
  let leads: any[] = []
  if (ids.length > 0) {
    const { data } = await db
      .from('leads')
      .select('id, name, phone, email, state, status, assigned_to, assigned_to_member, archived, contract_closed, created_at, assigned_at, updated_at')
      .in('id', ids)
      .order('updated_at', { ascending: false })
    leads = data || []
  }

  // Resolve assigned_to → buyer name
  const assignedToIds = Array.from(new Set(leads.map(l => l.assigned_to).filter(Boolean)))
  const buyerMap = new Map<string, string>()
  if (assignedToIds.length > 0) {
    const { data: bs } = await db.from('buyers').select('id, name, email').in('id', assignedToIds)
    for (const b of bs || []) buyerMap.set(b.id, `${b.name} (${b.email})`)
  }
  const memberMapById = new Map<string, string>()
  const memberAssignIds = Array.from(new Set(leads.map(l => l.assigned_to_member).filter(Boolean)))
  if (memberAssignIds.length > 0) {
    const { data: ms } = await db.from('team_members').select('id, name, email').in('id', memberAssignIds)
    for (const m of ms || []) memberMapById.set(m.id, `${m.name} (${m.email})`)
  }

  const enriched = leads.map(l => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    state: l.state,
    archived: l.archived,
    contract_closed: l.contract_closed,
    assigned_to_now: l.assigned_to ? buyerMap.get(l.assigned_to) || l.assigned_to : null,
    assigned_to_member_now: l.assigned_to_member ? memberMapById.get(l.assigned_to_member) || l.assigned_to_member : null,
    sources: Object.entries(sources).filter(([_, set]) => set.has(l.id)).map(([k]) => k),
    updated_at: l.updated_at,
  }))

  return NextResponse.json({
    buyer: { id: buyer.id, name: buyer.name, email: buyer.email },
    team_member_ids_with_same_email: memberIds,
    total_leads_ever_touched: leads.length,
    by_source: Object.fromEntries(Object.entries(sources).map(([k, s]) => [k, s.size])),
    leads: enriched,
  })
}
