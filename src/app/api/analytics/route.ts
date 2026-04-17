import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/analytics?buyer_id=X&days=30
 * Returns KPIs, ROI by source, leads-per-day, funnel stats.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const buyerId = url.searchParams.get('buyer_id')
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)))
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()
  const since = new Date(Date.now() - days * 86400_000).toISOString()

  // Leads in window
  const { data: leads } = await db
    .from('leads')
    .select('id, status, source, interest, created_at, price_paid')
    .eq('assigned_to', buyerId)
    .gte('created_at', since)

  const list = leads || []

  // Totals
  const totalReceived = list.length
  const totalConverted = list.filter(l => l.status === 'converted').length
  const totalContacted = list.filter(l => l.status === 'contacted' || l.status === 'converted').length
  const totalLost = list.filter(l => l.status === 'lost').length
  const conversionRate = totalReceived > 0 ? (totalConverted / totalReceived) * 100 : 0
  const contactRate = totalReceived > 0 ? (totalContacted / totalReceived) * 100 : 0
  const totalSpent = list.reduce((s, l) => s + (Number(l.price_paid) || 0), 0)

  // Leads-per-day (up to 30 bars)
  const byDay: Record<string, number> = {}
  for (const l of list) {
    const day = new Date(l.created_at).toISOString().slice(0, 10)
    byDay[day] = (byDay[day] || 0) + 1
  }
  const dailyLabels: string[] = []
  const dailyValues: number[] = []
  for (let i = Math.min(days, 30) - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10)
    dailyLabels.push(d.slice(5))
    dailyValues.push(byDay[d] || 0)
  }

  // By source (hot/cold/appointment)
  const bySource: Record<string, { received: number; converted: number; spent: number }> = {}
  for (const l of list) {
    const s = l.source || 'unknown'
    if (!bySource[s]) bySource[s] = { received: 0, converted: 0, spent: 0 }
    bySource[s].received++
    if (l.status === 'converted') bySource[s].converted++
    bySource[s].spent += Number(l.price_paid) || 0
  }

  // By interest (product types)
  const byInterest: Record<string, number> = {}
  for (const l of list) {
    const i = l.interest || 'outros'
    byInterest[i] = (byInterest[i] || 0) + 1
  }

  // Pipeline funnel (current state across all stages)
  const { data: pipelineLeads } = await db
    .from('pipeline_leads')
    .select('stage_id, pipeline_stages(name, position)')
    .eq('buyer_id', buyerId)

  const funnel: Array<{ stage: string; count: number; position: number }> = []
  const stageCounts: Record<string, { name: string; position: number; count: number }> = {}
  for (const pl of pipelineLeads || []) {
    const stage = (pl as any).pipeline_stages
    if (!stage) continue
    const key = stage.name
    if (!stageCounts[key]) stageCounts[key] = { name: key, position: stage.position, count: 0 }
    stageCounts[key].count++
  }
  Object.values(stageCounts).sort((a, b) => a.position - b.position).forEach(s => {
    funnel.push({ stage: s.name, count: s.count, position: s.position })
  })

  return NextResponse.json({
    days,
    kpis: {
      total_received: totalReceived,
      total_converted: totalConverted,
      total_contacted: totalContacted,
      total_lost: totalLost,
      conversion_rate: Number(conversionRate.toFixed(1)),
      contact_rate: Number(contactRate.toFixed(1)),
      total_spent: totalSpent,
      cost_per_conversion: totalConverted > 0 ? Number((totalSpent / totalConverted).toFixed(2)) : 0,
    },
    daily: { labels: dailyLabels, values: dailyValues },
    by_source: bySource,
    by_interest: byInterest,
    funnel,
  })
}
