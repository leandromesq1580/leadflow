/**
 * Planos de assinatura CRM Pro — 4 tiers por tempo de compromisso.
 * Quanto mais longo o compromisso, menor o $/mês. Tudo pago À VISTA (1 cobrança
 * cobrindo o período inteiro) e RECORRENTE (renova ao fim do período). Moeda: USD.
 * Bônus de leads DESCONTINUADO pra assinatura NOVA (2026-07-23). Assinantes antigos
 * (com histórico 'crm-bonus:%' em credits) seguem recebendo 5/mês nas renovações —
 * o gate está no webhook (invoice.payment_succeeded). leadsPerCycle/LEADS_PER_MONTH
 * ficam SÓ pra esse legado; não anunciar em tela de venda.
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
  leadsPerCycle: number // 5 * months — leads creditados a cada cobrança
  savingsPct: number // economia vs mensal, pra UI
  highlight?: boolean // tier em destaque na UI
}

export const LEADS_PER_MONTH = 5

export const CRM_PLANS: Record<CrmPlanKey, CrmPlan> = {
  mensal: { key: 'mensal', label: 'Mensal', months: 1, perMonth: 99, amountCents: 9900, interval: 'month', intervalCount: 1, leadsPerCycle: 5, savingsPct: 0 },
  trimestral: { key: 'trimestral', label: 'Trimestral', months: 3, perMonth: 79, amountCents: 23700, interval: 'month', intervalCount: 3, leadsPerCycle: 15, savingsPct: 20 },
  semestral: { key: 'semestral', label: 'Semestral', months: 6, perMonth: 69, amountCents: 41400, interval: 'month', intervalCount: 6, leadsPerCycle: 30, savingsPct: 30, highlight: true },
  anual: { key: 'anual', label: 'Anual', months: 12, perMonth: 59.90, amountCents: 71880, interval: 'year', intervalCount: 1, leadsPerCycle: 60, savingsPct: 40 },
}

export const CRM_PLAN_LIST: CrmPlan[] = [CRM_PLANS.mensal, CRM_PLANS.trimestral, CRM_PLANS.semestral, CRM_PLANS.anual]

export function getCrmPlan(key: string | undefined | null): CrmPlan | null {
  if (!key) return null
  return (CRM_PLANS as Record<string, CrmPlan>)[key] || null
}
