import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/reconcile-wa-ownership?secret=X
 *
 * Realoca whatsapp_messages.buyer_id que ficaram no buyer ERRADO devido
 * ao bug do webhook (commit 482464a). Pra cada lead, resolve o owner REAL
 * (member buyer > agency) e move TODAS as msgs do lead pra esse buyer.
 *
 * Chamada manual quando precisa corrigir mensagens historicas.
 *
 * Optionally: ?lead_id=X pra reconciliar so 1 lead.
 *             ?dry=1 pra so listar diferencas sem mexer.
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  const expected = (process.env.POLL_SECRET || 'leadflow-poll-2026').trim()
  if (secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dry = url.searchParams.get('dry') === '1'
  const onlyLeadId = url.searchParams.get('lead_id') || null

  const db = createAdminClient()

  // 1) Pega os leads que tem msgs WhatsApp (com filtro opcional)
  let leadsQuery = db
    .from('leads')
    .select('id, assigned_to, assigned_to_member')
  if (onlyLeadId) {
    leadsQuery = leadsQuery.eq('id', onlyLeadId)
  } else {
    // So leads que tem ao menos 1 msg
    const { data: leadIdsWithMsgs } = await db
      .from('whatsapp_messages')
      .select('lead_id')
      .not('lead_id', 'is', null)
      .limit(50000)
    const ids = Array.from(new Set((leadIdsWithMsgs || []).map(r => r.lead_id).filter(Boolean) as string[]))
    if (ids.length === 0) return NextResponse.json({ leads: 0, moved: 0 })
    // Postgres .in tem limite — paginar se necessario
    if (ids.length > 1000) {
      // Fallback: pega TUDO em leads e filtra depois
      leadsQuery = db.from('leads').select('id, assigned_to, assigned_to_member')
    } else {
      leadsQuery = leadsQuery.in('id', ids)
    }
  }

  const { data: leads } = await leadsQuery
  if (!leads || leads.length === 0) return NextResponse.json({ leads: 0, moved: 0 })

  // 2) Resolve owner real pra cada lead em batch
  const memberIds = Array.from(new Set(leads.map(l => l.assigned_to_member).filter(Boolean) as string[]))
  const memberBuyerById = new Map<string, string>()
  if (memberIds.length > 0) {
    const { data: members } = await db
      .from('team_members')
      .select('id, auth_user_id')
      .in('id', memberIds)
    const authIds = (members || []).map(m => m.auth_user_id).filter(Boolean) as string[]
    if (authIds.length > 0) {
      const { data: buyers } = await db
        .from('buyers')
        .select('id, auth_user_id')
        .in('auth_user_id', authIds)
      const authToBuyer = new Map<string, string>()
      for (const b of buyers || []) {
        if (b.auth_user_id) authToBuyer.set(b.auth_user_id, b.id)
      }
      for (const m of members || []) {
        if (m.auth_user_id) {
          const bid = authToBuyer.get(m.auth_user_id)
          if (bid) memberBuyerById.set(m.id, bid)
        }
      }
    }
  }

  // 3) Pra cada lead, se owner real != buyer atual das msgs, realoca
  let moved = 0
  let leadsMoved = 0
  const diffs: Array<{ lead_id: string; from?: string; to: string; count: number }> = []

  for (const lead of leads) {
    const memberBuyerId = lead.assigned_to_member ? memberBuyerById.get(lead.assigned_to_member) || null : null
    const ownerBuyerId = memberBuyerId || lead.assigned_to
    if (!ownerBuyerId) continue

    // Conta msgs com buyer_id != ownerBuyerId
    const { data: wrongMsgs, count: wrongCount } = await db
      .from('whatsapp_messages')
      .select('id, buyer_id', { count: 'exact' })
      .eq('lead_id', lead.id)
      .neq('buyer_id', ownerBuyerId)
      .limit(1)

    if (!wrongCount || wrongCount === 0) continue

    diffs.push({
      lead_id: lead.id,
      from: wrongMsgs?.[0]?.buyer_id,
      to: ownerBuyerId,
      count: wrongCount,
    })

    if (!dry) {
      const { error } = await db
        .from('whatsapp_messages')
        .update({ buyer_id: ownerBuyerId })
        .eq('lead_id', lead.id)
        .neq('buyer_id', ownerBuyerId)
      if (!error) {
        moved += wrongCount
        leadsMoved++
      } else {
        console.error('[Reconcile] erro lead', lead.id, error.message)
      }
    } else {
      moved += wrongCount
      leadsMoved++
    }
  }

  return NextResponse.json({
    dry,
    leads_scanned: leads.length,
    leads_with_diff: leadsMoved,
    msgs_moved: moved,
    sample: diffs.slice(0, 10),
  })
}
