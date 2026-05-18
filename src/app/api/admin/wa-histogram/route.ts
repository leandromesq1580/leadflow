import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/wa-histogram?secret=X&days=14
 * Conta msgs por dia, direção e buyer. Ajuda a ver quando o volume caiu.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const days = Math.min(60, Math.max(1, parseInt(url.searchParams.get('days') || '14', 10)))

  const db = createAdminClient()
  const since = new Date(Date.now() - days * 86400_000).toISOString()

  const { data } = await db.from('whatsapp_messages')
    .select('sent_at, direction, buyer_id')
    .gte('sent_at', since)
    .order('sent_at')
    .limit(50000)

  const { data: buyers } = await db.from('buyers').select('id, name')
  const buyerName = new Map((buyers || []).map(b => [b.id, b.name]))

  // Agrupa por dia + direção + buyer
  const grouped: Record<string, Record<string, { in: number; out: number }>> = {}
  for (const m of data || []) {
    const day = m.sent_at.slice(0, 10)
    const bid = m.buyer_id || 'null'
    grouped[day] = grouped[day] || {}
    grouped[day][bid] = grouped[day][bid] || { in: 0, out: 0 }
    if (m.direction === 'in') grouped[day][bid].in++
    else grouped[day][bid].out++
  }

  const days_array = Object.keys(grouped).sort()
  const histogram = days_array.map(day => {
    const buyersDay = grouped[day]
    let totalIn = 0, totalOut = 0
    const byBuyer: any[] = []
    for (const [bid, c] of Object.entries(buyersDay)) {
      totalIn += c.in
      totalOut += c.out
      byBuyer.push({ buyer: buyerName.get(bid) || bid.slice(0, 8), in: c.in, out: c.out })
    }
    byBuyer.sort((a, b) => (b.in + b.out) - (a.in + a.out))
    return { day, total_in: totalIn, total_out: totalOut, by_buyer: byBuyer }
  })

  return NextResponse.json({ days, histogram })
}
