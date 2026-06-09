import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/wa-health?secret=X[&buyer_email=Y]
 * Diagnóstico de saúde do fluxo WhatsApp: últimas msgs in/out, distribuição
 * por buyer, gap desde a última msg.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const buyerEmail = url.searchParams.get('buyer_email')
  let buyerId: string | null = null
  let buyerInfo: any = null
  if (buyerEmail) {
    const { data: b } = await db.from('buyers')
      .select('id, name, email, wa_bridge_url, wa_bridge_phone, wa_bridge_status, wa_bridge_key')
      .ilike('email', buyerEmail).maybeSingle()
    buyerId = b?.id || null
    buyerInfo = b ? { ...b, has_key: !!b.wa_bridge_key, wa_bridge_key: undefined } : null
  }

  // Últimas msgs (filtra por buyer se passado)
  let q = db.from('whatsapp_messages')
    .select('id, buyer_id, lead_id, direction, from_phone, to_phone, body, sent_at')
    .order('sent_at', { ascending: false })
    .limit(20)
  if (buyerId) q = q.eq('buyer_id', buyerId)
  const { data: lastMsgs } = await q

  // Contagens por direction nas últimas 24h
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString()
  const baseQuery = (dir: 'in' | 'out') => {
    let b = db.from('whatsapp_messages').select('id', { count: 'exact', head: true })
      .eq('direction', dir).gte('sent_at', dayAgo)
    if (buyerId) b = b.eq('buyer_id', buyerId)
    return b
  }
  const [inCount, outCount] = await Promise.all([baseQuery('in'), baseQuery('out')])

  // Gap desde a última msg in
  const lastInQuery = db.from('whatsapp_messages')
    .select('sent_at, from_phone, body')
    .eq('direction', 'in')
    .order('sent_at', { ascending: false }).limit(1)
  if (buyerId) lastInQuery.eq('buyer_id', buyerId)
  const { data: lastInArr } = await lastInQuery
  const lastIn = lastInArr?.[0] || null
  const gapMins = lastIn ? Math.floor((Date.now() - new Date(lastIn.sent_at).getTime()) / 60_000) : null

  // Distribuição (top buyers das últimas 24h)
  const { data: recent } = await db.from('whatsapp_messages')
    .select('buyer_id, direction')
    .gte('sent_at', dayAgo)
    .limit(5000)
  const dist: Record<string, { in: number; out: number }> = {}
  for (const m of recent || []) {
    const k = m.buyer_id || 'null'
    if (!dist[k]) dist[k] = { in: 0, out: 0 }
    if (m.direction === 'in') dist[k].in++
    else dist[k].out++
  }
  const buyerIds = Object.keys(dist).filter(k => k !== 'null')
  const { data: buyers } = buyerIds.length > 0
    ? await db.from('buyers').select('id, name, email, wa_bridge_phone').in('id', buyerIds)
    : { data: [] }
  const buyerMap = new Map((buyers || []).map(b => [b.id, b]))
  const distribution = Object.entries(dist).map(([id, c]) => ({
    buyer_id: id,
    buyer: buyerMap.get(id) || null,
    in: c.in, out: c.out,
  })).sort((a, b) => (b.in + b.out) - (a.in + a.out))

  return NextResponse.json({
    buyer_filter: buyerEmail ? { email: buyerEmail, info: buyerInfo } : null,
    now: new Date().toISOString(),
    counts_last_24h: { in: inCount.count ?? 0, out: outCount.count ?? 0 },
    last_inbound: lastIn,
    gap_minutes_since_last_inbound: gapMins,
    last_msgs: lastMsgs?.map(m => ({
      direction: m.direction,
      from: m.from_phone,
      to: m.to_phone,
      body: m.body?.slice(0, 60),
      sent_at: m.sent_at,
      lead_id: m.lead_id,
      buyer_id: m.buyer_id,
    })),
    distribution_24h: distribution,
  })
}
