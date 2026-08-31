import { createAdminClient } from './supabase/admin'
import { buyerTimezone, isAvailableNow } from './availability'
import { readBuyerPolicy } from './buyer-policy'
import type { LeadLanguage } from './lead-language'

/**
 * POSIÇÃO NA FILA do comprador (feature 2026-07-30).
 *
 * A fila NÃO é uma só: ela é resolvida por ESTADO do lead que chega, então o comprador
 * tem uma posição em cada estado licenciado. Aqui reproduzimos EXATAMENTE a ordenação da
 * distribuição (distribute.ts + delivery-queue): elegíveis do estado (crédito > 0, ativo,
 * licenciado) → piso diário (quem não recebeu hoje primeiro) → regra `queue_order`
 * (rodizio = menos leads em 30d primeiro; credito = maior saldo; antiguidade; hibrido).
 *
 * Também devolve o volume real do estado (média/dia dos últimos 14 dias, só leads de
 * campanha entregues) pra uma estimativa honesta de quando chega o próximo — e avisa
 * quando o comprador está FORA da janela de horário (aí ele não recebe agora).
 */

export interface QueueStateInfo {
  state: string
  position: number       // 1 = próximo lead daquele estado é dele
  total: number          // quantos disputam esse estado agora
  leadsPerDay: number    // média diária do estado (14d)
  etaDays: number | null // estimativa de dias até a vez dele (null = sem volume)
}

export interface QueuePosition {
  leadLanguage: LeadLanguage
  credits: number
  hasCredits: boolean
  availableNow: boolean       // dentro da janela de horário configurada
  nextWindowHint: string | null
  queueOrder: string
  receivedToday: number
  states: QueueStateInfo[]
  best: QueueStateInfo | null
  blockers: string[]          // motivos que impedem receber AGORA
  isStaff?: boolean
}

type Db = ReturnType<typeof createAdminClient>

function easternDayStartISO(): string {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  et.setHours(0, 0, 0, 0)
  // volta pra UTC aproximando pelo offset atual (basta pro corte do dia)
  const offsetMs = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getTime()
  return new Date(et.getTime() + offsetMs).toISOString()
}

export async function getQueuePosition(db: Db, buyerId: string, language: LeadLanguage = 'pt'): Promise<QueuePosition> {
  const { staffIds } = await readBuyerPolicy(db)
  if (staffIds.has(buyerId)) return {
    leadLanguage: language,
    credits: 0, hasCredits: false, availableNow: false, nextWindowHint: null,
    queueOrder: 'priority_only', receivedToday: 0, states: [], best: null,
    blockers: ['funcionario'], isStaff: true,
  }
  const blockers: string[] = []

  // saldo de crédito de lead
  const { data: creds } = await db.from('credits')
    .select('total_purchased, total_used, expires_at').eq('buyer_id', buyerId).eq('type', 'lead')
    .eq('lead_language', language)
  const credits = (creds || []).reduce((s, c) => {
    const rest = (c.total_purchased || 0) - (c.total_used || 0)
    const valido = !c.expires_at || new Date(c.expires_at).getTime() > Date.now()
    return s + (valido && rest > 0 ? rest : 0)
  }, 0)
  if (credits <= 0) blockers.push('sem_credito')

  // estados + disponibilidade (janela de horário)
  const { data: stRows } = await db.from('buyer_states').select('state_code').eq('buyer_id', buyerId)
  const meStates = (stRows || []).map(r => r.state_code)
  if (meStates.length === 0) blockers.push('sem_estado')

  let avail: { day_type: string; period: string; hours?: number[] | null }[] = []
  const { data: av, error: avErr } = await db.from('buyer_availability')
    .select('day_type, period, hours').eq('buyer_id', buyerId)
  if (avErr) {
    const { data: av2 } = await db.from('buyer_availability').select('day_type, period').eq('buyer_id', buyerId)
    avail = (av2 || []) as any
  } else avail = (av || []) as any
  const tz = buyerTimezone(meStates)
  const availableNow = isAvailableNow(avail as any, tz)
  if (!availableNow) blockers.push('fora_da_janela')

  const { data: b } = await db.from('buyers').select('is_active').eq('id', buyerId).maybeSingle()
  if (b && b.is_active === false) blockers.push('suspenso')

  // regra da fila
  let queueOrder = 'credito'
  try {
    const { data: rt } = await db.from('settings').select('value').eq('key', 'lead_routing').maybeSingle()
    queueOrder = ((rt?.value as any)?.queue_order as string) || 'credito'
  } catch {}

  const dayStart = easternDayStartISO()
  const { count: recToday } = await db.from('leads').select('*', { count: 'exact', head: true })
    .eq('assigned_to', buyerId).not('meta_lead_id', 'is', null).gte('assigned_at', dayStart)
    .eq('lead_language', language)
  const receivedToday = recToday || 0

  const since14 = new Date(Date.now() - 14 * 86400_000).toISOString()
  const states: QueueStateInfo[] = []

  for (const st of meStates) {
    // elegíveis DAQUELE estado (mesma RPC da distribuição)
    const { data: elig, error } = await db.rpc('get_eligible_buyers_by_language', { p_product_type: 'lead', p_state: st, p_language: language })
    if (error) throw error
    const uniq = new Map<string, { id: string; credits: number; leads_count: number }>()
    for (const e of (elig || []) as any[]) {
      if (staffIds.has(e.id)) continue
      const cur = uniq.get(e.id)
      if (cur) { cur.credits += Number(e.remaining) || 0; continue }
      uniq.set(e.id, { id: e.id, credits: Number(e.remaining) || 0, leads_count: Number(e.leads_count) || 0 })
    }
    let pool = [...uniq.values()]
    if (pool.length === 0) continue

    // só ativos (guard da distribuição)
    const { data: actives } = await db.from('buyers').select('id, created_at').in('id', pool.map(p => p.id)).eq('is_active', true)
    const createdAt: Record<string, number> = {}
    for (const a of actives || []) createdAt[a.id] = new Date(a.created_at as string).getTime()
    pool = pool.filter(p => createdAt[p.id] !== undefined)

    // piso diário: quem não recebeu hoje vem primeiro
    const { data: todayRows } = await db.from('leads').select('assigned_to')
      .in('assigned_to', pool.map(p => p.id)).not('meta_lead_id', 'is', null).gte('assigned_at', dayStart)
      .eq('lead_language', language)
    const gotToday = new Set((todayRows || []).map((r: any) => r.assigned_to))

    const cmp = (modo: string, a: typeof pool[0], z: typeof pool[0]) => {
      if (modo === 'antiguidade') return (createdAt[a.id] || 0) - (createdAt[z.id] || 0)
      if (modo === 'rodizio') return (a.leads_count - z.leads_count) || ((createdAt[a.id] || 0) - (createdAt[z.id] || 0))
      return z.credits - a.credits
    }
    pool.sort((a, z) => {
      const ag = gotToday.has(a.id) ? 1 : 0, zg = gotToday.has(z.id) ? 1 : 0
      if (ag !== zg) return ag - zg
      if (queueOrder === 'hibrido') return cmp(ag === 0 ? 'antiguidade' : 'credito', a, z)
      return cmp(queueOrder, a, z)
    })

    const idx = pool.findIndex(p => p.id === buyerId)
    if (idx < 0) continue // não elegível nesse estado agora (sem crédito/suspenso)

    // volume real do estado: leads de campanha entregues nos últimos 14 dias
    const { count: vol } = await db.from('leads').select('*', { count: 'exact', head: true })
      .eq('state', st).not('meta_lead_id', 'is', null).not('assigned_to', 'is', null)
      .eq('lead_language', language)
      .gte('created_at', since14)
    const leadsPerDay = Math.round(((vol || 0) / 14) * 10) / 10
    const etaDays = leadsPerDay > 0 ? Math.round(((idx + 1) / leadsPerDay) * 10) / 10 : null

    states.push({ state: st, position: idx + 1, total: pool.length, leadsPerDay, etaDays })
  }

  // melhor posição = a que deve entregar mais rápido
  states.sort((a, z) => (a.etaDays ?? 999) - (z.etaDays ?? 999) || a.position - z.position)
  const best = states[0] || null

  return {
    leadLanguage: language,
    credits, hasCredits: credits > 0, availableNow,
    nextWindowHint: availableNow ? null : 'Fora do seu horário de recebimento — ajuste em Configurações se quiser receber agora.',
    queueOrder, receivedToday, states, best, blockers,
  }
}
