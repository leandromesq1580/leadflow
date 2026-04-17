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

  // Verify agency + get team_members (linked to buyer accounts)
  const { data: buyer } = await db.from('buyers').select('is_agency').eq('id', buyerId).single()
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
      .select('status, price_paid')
      .eq('assigned_to', linkedBuyer.id)
      .gte('created_at', since)

    const list = leads || []
    const received = list.length
    const converted = list.filter(l => l.status === 'converted').length
    const revenue = list.filter(l => l.status === 'converted').reduce((s, l) => s + (Number(l.price_paid) || 0), 0)

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
