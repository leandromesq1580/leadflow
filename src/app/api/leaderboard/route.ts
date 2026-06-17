import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/leaderboard?buyer_id=X&days=30
 * Returns ranking of agency team members by conversion.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const buyerId = url.searchParams.get('buyer_id')
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)))
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()
  const since = new Date(Date.now() - days * 86400_000).toISOString()

  // Verify agency/admin
  const { data: buyer } = await db.from('buyers').select('is_agency, is_admin').eq('id', buyerId).single()

  // Admin: ranking da PLATAFORMA inteira (todo comprador que recebeu lead na janela).
  // 2 queries só: buyers (nomes) + leads agrupada em memória por assigned_to.
  if (buyer?.is_admin) {
    const { data: allBuyers } = await db.from('buyers').select('id, name').limit(1000)
    const nameMap = new Map((allBuyers || []).map(b => [b.id, b.name]))
    const { data: leads } = await db
      .from('leads')
      .select('assigned_to, contract_closed, policy_value')
      .gte('created_at', since)
      .not('assigned_to', 'is', null)
      .limit(50000)
    const agg = new Map<string, { received: number; converted: number; revenue: number }>()
    for (const l of leads || []) {
      const k = l.assigned_to as string
      if (!agg.has(k)) agg.set(k, { received: 0, converted: 0, revenue: 0 })
      const e = agg.get(k)!
      e.received++
      if (l.contract_closed === true) { e.converted++; e.revenue += Number(l.policy_value) || 0 }
    }
    const adminLeaders = Array.from(agg.entries()).map(([bid, e]) => ({
      buyer_id: bid,
      name: nameMap.get(bid) || 'Sem nome',
      received: e.received,
      converted: e.converted,
      conversion_rate: e.received > 0 ? (e.converted / e.received) * 100 : 0,
      revenue: e.revenue,
    }))
    adminLeaders.sort((a, b) => b.converted - a.converted || b.received - a.received)
    return NextResponse.json({ leaders: adminLeaders, days, scope: 'platform' })
  }

  if (!buyer?.is_agency) {
    return NextResponse.json({ leaders: [] })
  }

  // Team members linked to child buyers
  const { data: team } = await db
    .from('team_members')
    .select('id, name, auth_user_id, email')
    .eq('buyer_id', buyerId)

  if (!team || team.length === 0) return NextResponse.json({ leaders: [] })

  // For each team member, get their buyer record (linked via auth_user_id)
  const authIds = team.filter(t => t.auth_user_id).map(t => t.auth_user_id)
  const { data: linkedBuyers } = await db
    .from('buyers')
    .select('id, auth_user_id, name')
    .in('auth_user_id', authIds)

  const authToBuyer = new Map((linkedBuyers || []).map(b => [b.auth_user_id, b]))

  const leaders: Array<{
    buyer_id: string; name: string; received: number; converted: number; conversion_rate: number; revenue: number
  }> = []

  for (const member of team) {
    const linkedBuyer = member.auth_user_id ? authToBuyer.get(member.auth_user_id) : null
    if (!linkedBuyer) continue

    const { data: leads } = await db
      .from('leads')
      .select('contract_closed, policy_value')
      .eq('assigned_to', linkedBuyer.id)
      .gte('created_at', since)
      .limit(20000)

    const list = leads || []
    const received = list.length
    const converted = list.filter(l => l.contract_closed === true).length
    const revenue = list.filter(l => l.contract_closed === true).reduce((s, l) => s + (Number(l.policy_value) || 0), 0)

    leaders.push({
      buyer_id: linkedBuyer.id,
      name: linkedBuyer.name || member.name || 'Sem nome',
      received,
      converted,
      conversion_rate: received > 0 ? (converted / received) * 100 : 0,
      revenue,
    })
  }

  // Sort by converted desc, then by conversion_rate desc
  leaders.sort((a, b) => b.converted - a.converted || b.conversion_rate - a.conversion_rate)

  return NextResponse.json({ leaders, days })
}
