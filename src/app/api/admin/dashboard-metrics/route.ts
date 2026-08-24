import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Conta MHF3 — é onde a CAMPANHA LEADS SEGURO roda (decisão 2026-07-23: o gasto do
// dashboard conta SÓ essa campanha; a act_1626622925084500 mostrava outra conta e
// dava $711 vs $2.669 do gasto real do mês).
const AD_ACCOUNT_ID = 'act_2374409502997954'
// Só campanhas com esse trecho no nome entram no card "Gasto Tráfego".
const CAMPAIGN_FILTER = 'LEADS SEGURO'

// Período → date_preset do Meta + corte de data pro banco (fallback UTC; o cliente
// manda since/until no fuso LOCAL dele). since=null = tudo. until = fim do range
// (só p/ "mês passado", que é fechado).
function resolvePeriod(key: string): { datePreset: string; since: string | null; until: string | null } {
  const d = new Date()
  const y = d.getUTCFullYear(), m = d.getUTCMonth()
  switch (key) {
    case 'today': return { datePreset: 'today', since: new Date(Date.UTC(y, m, d.getUTCDate())).toISOString(), until: null }
    case '7d': return { datePreset: 'last_7d', since: new Date(Date.now() - 7 * 86400_000).toISOString(), until: null }
    case '30d': return { datePreset: 'last_30d', since: new Date(Date.now() - 30 * 86400_000).toISOString(), until: null }
    case 'this_month': return { datePreset: 'this_month', since: new Date(Date.UTC(y, m, 1)).toISOString(), until: null }
    case 'last_month': return { datePreset: 'last_month', since: new Date(Date.UTC(y, m - 1, 1)).toISOString(), until: new Date(Date.UTC(y, m, 1)).toISOString() }
    default: return { datePreset: 'maximum', since: null, until: null }
  }
}

/**
 * GET /api/admin/dashboard-metrics?period=today|7d|30d|all
 * KPIs do dashboard admin, TODOS no mesmo período. Receita − Gasto(Meta) = Resultado.
 */
export async function GET(request: NextRequest) {
  // auth: só admin (expõe receita/gasto)
  const supa = await createServerSupabase()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(request.url).searchParams
  const periodKey = sp.get('period') || '30d'
  const sinceParam = sp.get('since')
  const untilParam = sp.get('until')
  const fb = resolvePeriod(periodKey)
  const datePreset = fb.datePreset
  // O cliente manda since/until no FUSO LOCAL dele — faz "Hoje"/"Este mês" baterem
  // com o calendário do usuário (UTC está horas à frente). `until` só p/ "Mês passado".
  const since = periodKey === 'all' ? null : (sinceParam || fb.since)
  const until = untilParam || fb.until

  // Receita + pagantes (pagamentos concluídos no período)
  let payQ = db.from('payments').select('amount, buyer_id, product_type').eq('status', 'completed')
  if (since) payQ = payQ.gte('created_at', since)
  if (until) payQ = payQ.lt('created_at', until)
  const { data: payments } = await payQ
  const revenue = (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0)
  const payingBuyers = new Set((payments || []).map((p: any) => p.buyer_id).filter(Boolean)).size

  // Quebra da OPERAÇÃO DE LEADS: só a VENDA de leads (pacotes 'lead' + 'cold_lead'),
  // sem assinaturas CRM nem appointments — pra comparar com o custo de gerar (Meta).
  const leadPkgRevenue = (payments || []).filter((p: any) => p.product_type === 'lead').reduce((s, p) => s + Number(p.amount || 0), 0)
  const coldLeadRevenue = (payments || []).filter((p: any) => p.product_type === 'cold_lead').reduce((s, p) => s + Number(p.amount || 0), 0)
  const leadSalesRevenue = leadPkgRevenue + coldLeadRevenue

  // "Leads gerados" conta SÓ lead gerado pelo SISTEMA — ou seja, vindo do Meta Lead
  // Ads (tem `meta_lead_id`). Tudo criado na MÃO por comprador/admin (Manual,
  // INDICAÇÃO, CAMPANHA LEADS, Import CSV, CRM Antigo) e os prospects da página de
  // vendas (novos clientes do Lead4Pro) NÃO têm meta_lead_id → NÃO contam.
  let lgQ = db.from('leads').select('*', { count: 'exact', head: true }).not('meta_lead_id', 'is', null)
  if (since) lgQ = lgQ.gte('created_at', since)
  if (until) lgQ = lgQ.lt('created_at', until)
  const { count: leadsGenerated } = await lgQ
  let asgQ = db.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'assigned').not('meta_lead_id', 'is', null)
  if (since) asgQ = asgQ.gte('created_at', since)
  if (until) asgQ = asgQ.lt('created_at', until)
  const { count: assignedInPeriod } = await asgQ

  // Cumulativos (estado "agora", não dependem de período)
  const { count: pendingAppts } = await db.from('leads').select('*', { count: 'exact', head: true }).eq('product_type', 'appointment').eq('status', 'new')
  const { count: totalBuyers } = await db.from('buyers').select('*', { count: 'exact', head: true })

  // Compromisso de entrega: créditos de lead PAGOS no período + entregue após a compra.
  // Compromisso de entrega pela MESMA fonte do card Saldo Devedor: crédito reconciliado
  // comprou(total_purchased) - recebeu(total_used). NAO reconta leads (evita contar lead
  // MANUAL como entrega de lead pago) -> bate 1:1 com /api/admin/buyer-debt.
  // Saldo devedor é SEMPRE o atual (NÃO filtra por período) — bate com o card Saldo
  // Devedor em qualquer filtro (Hoje/7d/etc), porque saldo é estoque, não fluxo.
  const crQ = db.from('credits').select('buyer_id, total_purchased, total_used').eq('type', 'lead')
  const { data: leadCreditRows } = await crQ
  // Funcionários/casa fora da conta geral (pedido 23/08: os 100 créditos de
  // cortesia do Gabriel inflavam "vendidos", "devidos" e derrubavam o % entrega).
  // Lista vive em settings.metrics_exclude_buyers — adicionar gente nova sem deploy.
  let foraDaConta = new Set<string>()
  try {
    const { data: exc } = await db.from('settings').select('value').eq('key', 'metrics_exclude_buyers').maybeSingle()
    foraDaConta = new Set(((exc?.value as any)?.buyers || []) as string[])
  } catch { /* sem a chave, ninguém é excluído */ }
  const perBuyer = new Map<string, { purchased: number; used: number }>()
  for (const c of leadCreditRows || []) {
    if (!c.buyer_id || !(Number(c.total_purchased) > 0)) continue
    if (foraDaConta.has(c.buyer_id)) continue
    const e = perBuyer.get(c.buyer_id) || { purchased: 0, used: 0 }
    e.purchased += Number(c.total_purchased)
    e.used += Number(c.total_used) || 0
    perBuyer.set(c.buyer_id, e)
  }
  const soldLeads = Array.from(perBuyer.values()).reduce((s, e) => s + e.purchased, 0)
  const deliveredPaid = Array.from(perBuyer.values()).reduce((s, e) => s + Math.min(e.used, e.purchased), 0)
  const owedLeads = soldLeads - deliveredPaid
  const deliveryPct = soldLeads > 0 ? Math.round((deliveredPaid / soldLeads) * 100) : 0

  // Gasto com tráfego (Meta Ads) no MESMO período — conta certa.
  let adSpend = 0
  let adSpendOk = false
  try {
    const token = (process.env.META_PAGE_TOKEN || '').trim().replace(/\\n/g, '')
    if (token) {
      // level=campaign + filtering: entra na soma SÓ a campanha "LEADS SEGURO"
      // (cinto e suspensório: filtra na Meta E re-checa o nome aqui).
      const p = new URLSearchParams({
        fields: 'spend,campaign_name',
        level: 'campaign',
        filtering: JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: CAMPAIGN_FILTER }]),
        date_preset: datePreset,
        access_token: token,
      })
      const res = await fetch(`https://graph.facebook.com/v25.0/${AD_ACCOUNT_ID}/insights?${p.toString()}`, { next: { revalidate: 300 } })
      const raw = await res.json()
      if (!raw.error && Array.isArray(raw.data)) {
        adSpend = raw.data
          .filter((r: any) => String(r.campaign_name || '').toUpperCase().includes(CAMPAIGN_FILTER))
          .reduce((s: number, r: any) => s + parseFloat(r.spend || '0'), 0)
        adSpendOk = true
      }
    }
  } catch {}
  const netResult = revenue - adSpend
  // Lucro da operação de leads: o que a venda de leads rendeu − o que custou gerar.
  const leadProfit = leadSalesRevenue - adSpend
  const cpl = (leadsGenerated || 0) > 0 ? adSpend / (leadsGenerated || 1) : 0

  return NextResponse.json({
    period: periodKey,
    revenue, adSpend, adSpendOk, netResult,
    leadPkgRevenue, coldLeadRevenue, leadSalesRevenue, leadProfit, cpl,
    leadsGenerated: leadsGenerated || 0,
    assignedInPeriod: assignedInPeriod || 0,
    soldLeads, deliveredPaid, owedLeads, deliveryPct,
    payingBuyers, totalBuyers: totalBuyers || 0,
    pendingAppts: pendingAppts || 0,
  })
}
