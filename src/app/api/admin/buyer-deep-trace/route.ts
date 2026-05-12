import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/buyer-deep-trace?secret=X&email=Y
 *
 * Investigacao profunda: TODAS as msgs, follow_ups, activity ligadas
 * ao buyer_id da conta — sem filtros, pra rastrear leads que sumiram.
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

  const { data: buyer } = await db.from('buyers').select('id, name, email, created_at').ilike('email', email).maybeSingle()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  // 1) TODAS as whatsapp_messages com buyer_id (sem filtros)
  const { data: allWa, count: waCount } = await db
    .from('whatsapp_messages')
    .select('id, lead_id, direction, from_phone, sent_at, body', { count: 'exact' })
    .eq('buyer_id', buyer.id)
    .order('sent_at', { ascending: false })
    .limit(2000)

  // Distinct lead_ids e from_phones
  const leadIds = new Set<string>()
  const fromPhones = new Set<string>()
  let msgsWithoutLead = 0
  for (const m of allWa || []) {
    if (m.lead_id) leadIds.add(m.lead_id)
    else msgsWithoutLead++
    if (m.from_phone) fromPhones.add(m.from_phone)
  }

  // 2) Follow_ups
  const { count: fuCount } = await db
    .from('follow_ups')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_id', buyer.id)

  // 3) Pipeline_leads do pipeline dela
  const { data: pipes } = await db.from('pipelines').select('id, name').eq('buyer_id', buyer.id)
  const pipelineIds = (pipes || []).map(p => p.id)
  const { count: plCount } = pipelineIds.length > 0
    ? await db.from('pipeline_leads').select('id', { count: 'exact', head: true }).in('pipeline_id', pipelineIds)
    : { count: 0 }

  // 4) Pra cada lead_id distinct das msgs, busca info atual
  const idArr = Array.from(leadIds)
  let leadsInfo: any[] = []
  if (idArr.length > 0) {
    const { data: ls } = await db
      .from('leads')
      .select('id, name, phone, assigned_to, assigned_to_member, archived, contract_closed, created_at, updated_at')
      .in('id', idArr)
      .order('updated_at', { ascending: false })
    leadsInfo = ls || []
  }

  // Resolve nomes
  const ownerIds = Array.from(new Set(leadsInfo.map(l => l.assigned_to).filter(Boolean)))
  const ownerMap = new Map<string, string>()
  if (ownerIds.length > 0) {
    const { data: bs } = await db.from('buyers').select('id, name').in('id', ownerIds)
    for (const b of bs || []) ownerMap.set(b.id, b.name)
  }

  const enriched = leadsInfo.map(l => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    assigned_to_now: l.assigned_to ? ownerMap.get(l.assigned_to) || l.assigned_to : null,
    has_member_assignment: !!l.assigned_to_member,
    archived: l.archived,
    contract_closed: l.contract_closed,
    last_activity: l.updated_at,
  }))

  return NextResponse.json({
    buyer: { id: buyer.id, name: buyer.name, email: buyer.email, created_at: buyer.created_at },
    pipelines: pipes,
    counts: {
      total_whatsapp_messages: waCount ?? 0,
      whatsapp_messages_without_lead_id: msgsWithoutLead,
      distinct_leads_in_msgs: leadIds.size,
      distinct_phones_in_msgs: fromPhones.size,
      total_follow_ups: fuCount ?? 0,
      total_pipeline_leads: plCount ?? 0,
    },
    leads_from_msgs: enriched,
  })
}
