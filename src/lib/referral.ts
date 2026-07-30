import { createAdminClient } from './supabase/admin'

/**
 * PROGRAMA DE INDICAÇÃO — regras aprovadas pelo dono em 2026-07-30.
 *
 *  Recompensa (1 por indicado, na PRIMEIRA compra dele):
 *    CRM Mensal $99 → $10 · Trimestral $237 → $25 · Semestral $414 → $40 · Anual $718,80 → $70   (~10%)
 *    Leads 10/$280 → $15 · 25/$650 → $30 · 50/$1150 → $55 · pacotes frios → 5%                    (5%)
 *  Carência: crédito fica PENDENTE 14 dias (cancelamento/chargeback do indicado estorna).
 *  Uso: DESCONTO em compra de pacote de leads, até 50% do pedido. Não há saque.
 *  Teto: $300/mês por indicador. Auto-indicação e conta pré-existente não valem.
 *
 * Antes desta regra: $25 fixo pro mensal (25% do pagamento!) e o MESMO $25 pro
 * semestral ($414); compra de leads não gerava nada; e o crédito não podia ser usado.
 */

export const CARENCIA_DIAS = 14
export const TETO_MES_CENTS = 30_000        // $300 por indicador por mês
export const MAX_DESCONTO_PCT = 0.5         // crédito cobre até 50% do pedido
const PCT_CRM = 0.10
const PCT_LEAD = 0.05

type Db = ReturnType<typeof createAdminClient>

/** Tabela fixa (valores comunicados ao cliente); fora dela cai no percentual. */
const TABELA: Record<number, number> = {
  9900: 1000,   // CRM mensal
  23700: 2500,  // CRM trimestral
  41400: 4000,  // CRM semestral
  71880: 7000,  // CRM anual
  28000: 1500,  // 10 leads
  65000: 3000,  // 25 leads
  115000: 5500, // 50 leads
}

export function rewardCentsFor(kind: 'crm' | 'lead', amountCents: number): number {
  const fixo = TABELA[amountCents]
  if (fixo) return fixo
  const pct = kind === 'crm' ? PCT_CRM : PCT_LEAD
  return Math.floor((amountCents * pct) / 100) * 100 // arredonda pra dólar inteiro
}

export function moneyFromCents(c: number): string {
  return `$${(c / 100).toFixed(2)}`
}

/**
 * Concede a recompensa ao INDICADOR quando o indicado faz a 1ª compra.
 * Idempotente e com todas as travas (auto-indicação, 1 por indicado, teto mensal).
 * Nunca lança: falha aqui não pode derrubar o webhook de pagamento.
 */
export async function grantReferralReward(
  db: Db,
  referredBuyerId: string,
  kind: 'crm' | 'lead',
  amountCents: number,
): Promise<{ granted: boolean; reason?: string; cents?: number }> {
  try {
    const { data: referred } = await db.from('buyers')
      .select('id, referred_by, email, phone').eq('id', referredBuyerId).maybeSingle()
    if (!referred?.referred_by) return { granted: false, reason: 'sem indicador' }
    if (referred.referred_by === referredBuyerId) return { granted: false, reason: 'auto-indicação' }

    const { data: referrer } = await db.from('buyers')
      .select('id, email, phone, referral_credit_cents').eq('id', referred.referred_by).maybeSingle()
    if (!referrer) return { granted: false, reason: 'indicador inexistente' }

    // auto-indicação disfarçada: mesmo email ou mesmo telefone
    const sameEmail = (referrer.email || '').trim().toLowerCase() === (referred.email || '').trim().toLowerCase()
    const digits = (s?: string | null) => String(s || '').replace(/\D/g, '').slice(-10)
    const samePhone = digits(referrer.phone) && digits(referrer.phone) === digits(referred.phone)
    if (sameEmail || samePhone) {
      await db.from('referral_rewards').insert({
        referrer_buyer_id: referrer.id, referred_buyer_id: referredBuyerId,
        trigger_event: kind === 'crm' ? 'crm_subscription' : 'lead_purchase',
        reward_cents: 0, status: 'canceled', note: 'auto-indicação (mesmo email/telefone)',
      }).select().maybeSingle()
      return { granted: false, reason: 'auto-indicação (mesmo contato)' }
    }

    // 1 recompensa por indicado (qualquer evento que valha dinheiro)
    const { data: já } = await db.from('referral_rewards')
      .select('id').eq('referred_buyer_id', referredBuyerId).gt('reward_cents', 0)
      .neq('status', 'canceled').limit(1).maybeSingle()
    if (já) return { granted: false, reason: 'indicado já gerou recompensa' }

    const cents = rewardCentsFor(kind, amountCents)
    if (cents <= 0) return { granted: false, reason: 'valor sem recompensa' }

    // teto mensal do indicador
    const desde = new Date(Date.now() - 30 * 86400_000).toISOString()
    const { data: doMes } = await db.from('referral_rewards')
      .select('reward_cents').eq('referrer_buyer_id', referrer.id)
      .neq('status', 'canceled').gte('granted_at', desde)
    const somaMes = (doMes || []).reduce((s, r) => s + (r.reward_cents || 0), 0)
    if (somaMes + cents > TETO_MES_CENTS) {
      await db.from('referral_rewards').insert({
        referrer_buyer_id: referrer.id, referred_buyer_id: referredBuyerId,
        trigger_event: kind === 'crm' ? 'crm_subscription' : 'lead_purchase',
        reward_cents: 0, status: 'canceled',
        note: `teto mensal atingido (${moneyFromCents(somaMes)} de ${moneyFromCents(TETO_MES_CENTS)})`,
      }).select().maybeSingle()
      return { granted: false, reason: 'teto mensal do indicador' }
    }

    const availableAt = new Date(Date.now() + CARENCIA_DIAS * 86400_000).toISOString()
    const { error } = await db.from('referral_rewards').insert({
      referrer_buyer_id: referrer.id, referred_buyer_id: referredBuyerId,
      trigger_event: kind === 'crm' ? 'crm_subscription' : 'lead_purchase',
      reward_cents: cents, status: 'pending', available_at: availableAt,
      note: `${kind === 'crm' ? 'assinatura' : 'pacote de leads'} de ${moneyFromCents(amountCents)}`,
    })
    if (error) {
      if (/status|available_at/.test(error.message)) return { granted: false, reason: 'migration 035 pendente' }
      return { granted: false, reason: error.message }
    }
    console.log(`[referral] +${moneyFromCents(cents)} PENDENTE p/ ${referrer.id} (indicado ${referredBuyerId}, libera em ${CARENCIA_DIAS}d)`)
    return { granted: true, cents }
  } catch (e: any) {
    console.error('[referral] grant falhou:', e?.message)
    return { granted: false, reason: e?.message }
  }
}

/** Cron: libera as recompensas cuja carência venceu (pending → available) e credita o saldo. */
export async function releasePendingRewards(): Promise<number> {
  const db = createAdminClient()
  let n = 0
  try {
    const { data: rows } = await db.from('referral_rewards')
      .select('id, referrer_buyer_id, reward_cents')
      .eq('status', 'pending').lte('available_at', new Date().toISOString()).limit(50)
    for (const r of rows || []) {
      const { data: b } = await db.from('buyers').select('referral_credit_cents').eq('id', r.referrer_buyer_id).maybeSingle()
      const novo = (b?.referral_credit_cents || 0) + (r.reward_cents || 0)
      const { error } = await db.from('referral_rewards').update({ status: 'available' }).eq('id', r.id).eq('status', 'pending')
      if (error) continue
      await db.from('buyers').update({ referral_credit_cents: novo }).eq('id', r.referrer_buyer_id)
      n++
      console.log(`[referral] liberado ${moneyFromCents(r.reward_cents || 0)} p/ ${r.referrer_buyer_id}`)
    }
  } catch { return 0 } // migration pendente
  return n
}

/** Estorna recompensas do indicado (reembolso/cancelamento dentro da carência). */
export async function cancelRewardsFor(db: Db, referredBuyerId: string, motivo: string): Promise<number> {
  try {
    const { data: rows } = await db.from('referral_rewards')
      .select('id, referrer_buyer_id, reward_cents, status')
      .eq('referred_buyer_id', referredBuyerId).in('status', ['pending', 'available']).gt('reward_cents', 0)
    let n = 0
    for (const r of rows || []) {
      await db.from('referral_rewards').update({ status: 'canceled', note: `estornado: ${motivo}` }).eq('id', r.id)
      // se já estava disponível, tira do saldo (sem deixar negativo)
      if (r.status === 'available') {
        const { data: b } = await db.from('buyers').select('referral_credit_cents').eq('id', r.referrer_buyer_id).maybeSingle()
        const novo = Math.max(0, (b?.referral_credit_cents || 0) - (r.reward_cents || 0))
        await db.from('buyers').update({ referral_credit_cents: novo }).eq('id', r.referrer_buyer_id)
      }
      n++
    }
    if (n) console.log(`[referral] ${n} recompensa(s) estornada(s) — ${motivo}`)
    return n
  } catch { return 0 }
}

/** Quanto do crédito pode entrar como desconto neste pedido (até 50%). */
export async function discountForOrder(db: Db, buyerId: string, orderCents: number): Promise<number> {
  try {
    const { data: b } = await db.from('buyers').select('referral_credit_cents').eq('id', buyerId).maybeSingle()
    const saldo = b?.referral_credit_cents || 0
    if (saldo <= 0) return 0
    const teto = Math.floor(orderCents * MAX_DESCONTO_PCT)
    return Math.max(0, Math.min(saldo, teto))
  } catch { return 0 }
}

/** Debita o crédito usado quando o pagamento com desconto se confirma (webhook). */
export async function consumeCredit(
  db: Db, buyerId: string, cents: number, sessionId: string,
): Promise<void> {
  if (cents <= 0) return
  try {
    const { data: dupe } = await db.from('referral_redemptions').select('id').eq('stripe_session_id', sessionId).maybeSingle()
    if (dupe) return
    const { data: b } = await db.from('buyers').select('referral_credit_cents').eq('id', buyerId).maybeSingle()
    const novo = Math.max(0, (b?.referral_credit_cents || 0) - cents)
    await db.from('referral_redemptions').insert({
      buyer_id: buyerId, cents, stripe_session_id: sessionId, note: 'desconto em compra de leads',
    })
    await db.from('buyers').update({ referral_credit_cents: novo }).eq('id', buyerId)
    console.log(`[referral] crédito usado: ${moneyFromCents(cents)} (buyer ${buyerId})`)
  } catch (e: any) {
    console.error('[referral] consumo falhou:', e?.message)
  }
}
