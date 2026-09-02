/**
 * Planos de assinatura CRM Pro — 4 tiers por tempo de compromisso.
 * Quanto mais longo o compromisso, menor o $/mês. Tudo pago À VISTA (1 cobrança
 * cobrindo o período inteiro) e RECORRENTE (renova ao fim do período). Moeda: USD.
 * Bônus de leads DESCONTINUADO. Cobranças e renovações feitas a partir de
 * 01/08/2026 nunca geram créditos de lead. Ciclos pagos antes do corte podem
 * terminar somente quando já possuíam o marcador explícito do benefício.
 * Landing page exclusiva também DESCONTINUADA como oferta (2026-07-24) — não anunciar.
 * Fonte única de checkout, UI e webhook.
 */
export type CrmPlanKey = 'mensal' | 'trimestral' | 'semestral' | 'anual'

export interface CrmPlan {
  key: CrmPlanKey
  label: string
  months: number // meses cobertos por ciclo de cobrança
  perMonth: number // $/mês exibido na UI
  amountCents: number // total cobrado à vista (em cents) por ciclo
  interval: 'month' | 'year' // recurring.interval no Stripe
  intervalCount: number // recurring.interval_count no Stripe
  savingsPct: number // economia vs mensal, pra UI
  highlight?: boolean // tier em destaque na UI
}

export const CRM_BONUS_CUTOFF_ISO = '2026-08-01T04:00:00.000Z'
export const LEGACY_CRM_LEADS_PER_MONTH = 5

export function isLegacyCrmBonusCycle(paymentCreatedAt: string | null | undefined): boolean {
  if (!paymentCreatedAt) return false
  const paidAt = new Date(paymentCreatedAt).getTime()
  return Number.isFinite(paidAt) && paidAt < new Date(CRM_BONUS_CUTOFF_ISO).getTime()
}

export const CRM_PLANS: Record<CrmPlanKey, CrmPlan> = {
  mensal: { key: 'mensal', label: 'Mensal', months: 1, perMonth: 99, amountCents: 9900, interval: 'month', intervalCount: 1, savingsPct: 0 },
  trimestral: { key: 'trimestral', label: 'Trimestral', months: 3, perMonth: 79, amountCents: 23700, interval: 'month', intervalCount: 3, savingsPct: 20 },
  semestral: { key: 'semestral', label: 'Semestral', months: 6, perMonth: 69, amountCents: 41400, interval: 'month', intervalCount: 6, savingsPct: 30, highlight: true },
  anual: { key: 'anual', label: 'Anual', months: 12, perMonth: 59.90, amountCents: 71880, interval: 'year', intervalCount: 1, savingsPct: 40 },
}

export const CRM_PLAN_LIST: CrmPlan[] = [CRM_PLANS.mensal, CRM_PLANS.trimestral, CRM_PLANS.semestral, CRM_PLANS.anual]

export function getCrmPlan(key: string | undefined | null): CrmPlan | null {
  if (!key) return null
  return (CRM_PLANS as Record<string, CrmPlan>)[key] || null
}
