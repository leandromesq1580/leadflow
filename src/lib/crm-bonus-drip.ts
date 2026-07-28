import { createAdminClient } from './supabase/admin'
import { CRM_PLAN_LIST, LEADS_PER_MONTH } from './crm-plans'

/**
 * DRIP dos leads de bônus do CRM: 5 a cada 30 dias, até o total do plano por ciclo.
 *
 * O webhook (invoice.payment_succeeded) credita o MÊS 1 (5 leads) na cobrança, com
 * marker `crm-bonus:<invoice>:m1`. Este job pinga os meses seguintes (m2, m3...) a
 * cada 30 dias, 5 por vez, até completar os meses do plano (trimestral 3, semestral
 * 6, anual 12). Mensal não dripa (m1 já é o total).
 *
 * Idempotente: cada mês é um credit com marker `crm-bonus:<invoice>:m<N>` único —
 * não credita 2x. Roda pelo poll-leads (a cada 2 min); só age quando passaram 30 dias
 * do último mês creditado E ainda há meses pendentes no ciclo. Renovação = nova
 * cobrança = novo invoice = novo m1 (ciclo recomeça).
 */
// ⚖️ EXCEÇÃO (2026-07-28, regra corrigida pelo dono: "assinou o CRM = 5 leads POR MÊS"):
// 5 assinantes de jul/2026 (Ivone, Rita, Adriana, Elma, Mariana Fonseca) mantêm o benefício CLÁSSICO —
// m1 no invoice + este drip pinga +5/30d até o total do plano (semestral 30, anual 60).
// Eles entram aqui naturalmente porque têm marker 'crm-bonus:%' casado com o payment.
// Benefício segue EXTINTO pra qualquer outro assinante (gate no webhook). Não estender
// sem decisão do dono.
export async function dripCrmBonusLeads(): Promise<number> {
  const supabase = createAdminClient()
  let granted = 0

  // Compradores que assinaram o CRM (têm subscription). Ativo ou não — o ciclo PAGO
  // tem direito aos meses dele (eles pagaram o trimestre/semestre/ano à vista).
  const { data: subs } = await supabase
    .from('buyers')
    .select('id, name')
    .not('crm_subscription_id', 'is', null)

  for (const b of subs || []) {
    try {
      // Última cobrança CRM = ciclo atual (o invoice carrega o marker base).
      const { data: pay } = await supabase
        .from('payments')
        .select('amount, stripe_session_id, created_at')
        .eq('buyer_id', b.id).eq('product_type', 'crm').eq('status', 'completed')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!pay?.stripe_session_id) continue

      const plan = CRM_PLAN_LIST.find(p => p.amountCents === Math.round((pay.amount || 0) * 100))
      if (!plan || plan.months <= 1) continue // mensal não tem drip

      const invoice = pay.stripe_session_id
      const { data: months } = await supabase
        .from('credits')
        .select('purchased_at')
        .eq('buyer_id', b.id).eq('type', 'lead')
        .like('stripe_payment_id', `crm-bonus:${invoice}:m%`)
        .order('purchased_at', { ascending: false })

      const monthsGranted = months?.length || 0
      if (monthsGranted === 0) continue          // m1 vem do webhook; se não há, nada a dripar
      if (monthsGranted >= plan.months) continue // ciclo já completo

      const lastAt = months![0].purchased_at as string
      const daysSince = (Date.now() - new Date(lastAt).getTime()) / 86_400_000
      if (daysSince < 30) continue               // ainda não fechou 30 dias

      const nextMonth = monthsGranted + 1
      const marker = `crm-bonus:${invoice}:m${nextMonth}`
      const { data: dup } = await supabase.from('credits').select('id').eq('stripe_payment_id', marker).maybeSingle()
      if (dup) continue

      const { error } = await supabase.from('credits').insert({
        buyer_id: b.id, type: 'lead', total_purchased: LEADS_PER_MONTH, total_used: 0,
        price_per_unit: 0, stripe_payment_id: marker, purchased_at: new Date().toISOString(),
      })
      if (!error) {
        granted++
        console.log(`[CRM drip] +${LEADS_PER_MONTH} leads (${marker}, m${nextMonth}/${plan.months}) -> ${b.name}`)
      }
    } catch (e) {
      console.error('[CRM drip] erro buyer', b.id, (e as any)?.message)
    }
  }

  if (granted > 0) console.log(`[CRM drip] ${granted} grant(s) de ${LEADS_PER_MONTH} leads`)
  return granted
}
