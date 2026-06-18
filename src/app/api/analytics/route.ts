import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchStageByLead, isWonStage, isContacted } from '@/lib/lead-stage'

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

  // Admin enxerga a plataforma inteira; comprador comum, só os próprios leads.
  const { data: viewer } = await db.from('buyers').select('is_admin').eq('id', buyerId).single()
  const isAdmin = !!viewer?.is_admin

  // Leads na janela. Colunas REAIS de leads: conversão = contract_closed,
  // valor = policy_value, fonte = campaign_name. NÃO existem 'source'/'price_paid'
  // — selecioná-las fazia a query falhar (data=null) e ZERAR a página inteira.
  let q = db
    .from('leads')
    .select('id, status, type, product_type, campaign_name, interest, created_at, policy_value, contract_closed')
    .gte('created_at', since)
    .limit(20000)
  if (!isAdmin) q = q.eq('assigned_to', buyerId)
  const { data: leads, error: leadsErr } = await q
  if (leadsErr) console.error('[Analytics] leads query err:', leadsErr.message)

  const list = leads || []

  // Estágio atual de cada lead (pipeline) — é onde o comprador marca conversão.
  // contract_closed quase nunca é marcado; quem fecha move pro estágio "Fechado/Ganho".
  const stageMap = await fetchStageByLead(db, list.map(l => l.id))
  const won = (l: any) => isWonStage(stageMap[l.id], l.contract_closed)

  // Totals. Conversão = estágio de ganho (ou contract_closed). Contatado = saiu de "Novo".
  const totalReceived = list.length
  const totalConverted = list.filter(won).length
  const totalContacted = list.filter(l => isContacted(stageMap[l.id], { contractClosed: l.contract_closed, appointmentSet: l.status === 'appointment_set' })).length
  const totalLost = list.filter(l => l.status === 'lost').length
  const conversionRate = totalReceived > 0 ? (totalConverted / totalReceived) * 100 : 0
  const contactRate = totalReceived > 0 ? (totalContacted / totalReceived) * 100 : 0
  const totalRevenue = list.filter(won).reduce((s, l) => s + (Number(l.policy_value) || 0), 0)

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
    const s = l.campaign_name || 'Sem fonte'
    if (!bySource[s]) bySource[s] = { received: 0, converted: 0, spent: 0 }
    bySource[s].received++
    if (won(l)) { bySource[s].converted++; bySource[s].spent += Number(l.policy_value) || 0 }
  }

  // By interest (product types)
  const byInterest: Record<string, number> = {}
  for (const l of list) {
    const i = l.interest || 'outros'
    byInterest[i] = (byInterest[i] || 0) + 1
  }

  // Pipeline funnel. pipeline_leads NÃO tem buyer_id — filtra pelos pipelines do
  // comprador (admin = todos os pipelines da plataforma). Antes filtrava por uma
  // coluna inexistente → query falhava → funil sempre "Nenhum lead no pipeline".
  let plq = db.from('pipeline_leads').select('stage_id, pipeline_stages(name, position)').limit(20000)
  if (!isAdmin) {
    const { data: myPipes } = await db.from('pipelines').select('id').eq('buyer_id', buyerId)
    const ids = (myPipes || []).map(p => p.id)
    plq = plq.in('pipeline_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  }
  const { data: pipelineLeads, error: plErr } = await plq
  if (plErr) console.error('[Analytics] funnel query err:', plErr.message)

  // Normaliza o nome do estágio (trim + sem acento + minúsculo) pra MESCLAR
  // variações entre pipelines ("Não Atendeu" / "Nao atendeu" / "Não Atendeu ") —
  // senão o admin (plataforma inteira) vê o MESMO estágio duplicado em várias linhas.
  const normStage = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  const funnel: Array<{ stage: string; count: number; position: number }> = []
  const stageCounts: Record<string, { variants: Record<string, number>; position: number; count: number }> = {}
  for (const pl of pipelineLeads || []) {
    const stage = (pl as any).pipeline_stages
    if (!stage?.name) continue
    const key = normStage(stage.name)
    if (!key) continue
    if (!stageCounts[key]) stageCounts[key] = { variants: {}, position: stage.position ?? 0, count: 0 }
    const sc = stageCounts[key]
    sc.count++
    const disp = String(stage.name).trim()
    sc.variants[disp] = (sc.variants[disp] || 0) + 1
    if ((stage.position ?? 0) < sc.position) sc.position = stage.position ?? 0
  }
  Object.values(stageCounts).sort((a, b) => a.position - b.position).forEach(s => {
    // rótulo = variante mais comum (ex: "Não Atendeu", não "nao atendeu ")
    const name = Object.entries(s.variants).sort((a, b) => b[1] - a[1])[0][0]
    funnel.push({ stage: name, count: s.count, position: s.position })
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
      total_revenue: Number(totalRevenue.toFixed(2)),
      total_spent: 0,
      cost_per_conversion: 0,
    },
    daily: { labels: dailyLabels, values: dailyValues },
    by_source: bySource,
    by_interest: byInterest,
    funnel,
  })
}
