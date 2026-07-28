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
// ⚖️ EXCEÇÃO "5 POR CICLO" (decisão 2026-07-28): estes 4 assinantes ganham 5 leads
// POR CICLO de assinatura (semestral = 5 a cada 6 meses; anual = 5 a cada 12), não
// o drip antigo de 5/mês. Como: eles têm marker 'crm-bonus:%' (legado) → o webhook
// credita 5 (m1) a CADA fatura/renovação; este drip PULA eles pra não multiplicar.
// Benefício encerrado pra qualquer outro assinante — não adicionar nomes sem decisão do dono.
const EXCECAO_5_POR_CICLO = new Set([
  'ef5969bc-f78a-4d5c-8101-f0ffe9a2f205', // Ivone Ferreira da Silva Rosa (semestral)
  '5635b282-da46-4a82-9672-bc3c92907b81', // Rita Feitosa
  '62745ad7-f356-4bf9-8217-9b2a734f9f16', // Adriana Santana de Rezende Menezes (anual)
  '2f0fb41a-2b9a-4ef9-b23b-2c4e2561c098', // Elma Franco (semestral)
])

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
      if (EXCECAO_5_POR_CICLO.has(b.id)) continue // 5 por CICLO via webhook — sem drip
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
