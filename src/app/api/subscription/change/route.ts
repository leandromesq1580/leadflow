import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCrmPlan } from '@/lib/crm-plans'

/**
 * POST /api/subscription/change — troca o plano de uma assinatura CRM Pro ATIVA
 * (mensal ↔ trimestral ↔ semestral ↔ anual) sem cancelar, com proração.
 * O webhook customer.subscription.updated confirma o novo estado no buyer.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const plan = getCrmPlan(body.plan)
    if (!plan) return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })

    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const db = createAdminClient()
    const { data: buyer } = await db
      .from('buyers')
      .select('id, crm_subscription_id, crm_subscription_status')
      .eq('auth_user_id', user.id)
      .single()
    if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
    if (buyer.crm_subscription_status !== 'active' || !buyer.crm_subscription_id) {
      return NextResponse.json({ error: 'Você não tem assinatura ativa para trocar. Assine um plano primeiro.' }, { status: 400 })
    }

    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(buyer.crm_subscription_id)
    if (sub.status !== 'active') {
      return NextResponse.json({ error: 'Sua assinatura não está ativa no Stripe.' }, { status: 400 })
    }
    if (sub.metadata?.plan === plan.key) {
      return NextResponse.json({ error: 'Você já está nesse plano.' }, { status: 400 })
    }
    const item = sub.items.data[0]
    if (!item?.id) return NextResponse.json({ error: 'Item da assinatura não encontrado.' }, { status: 400 })
    // price_data de assinatura exige um Product EXISTENTE e ATIVO. Reusa o da assinatura SE ativo.
    // Se estiver ARQUIVADO — ou foi AUTO-CRIADO pelo Stripe (product_data no checkout), que não pode
    // ser reativado/editado ("created by Stripe automatically") — cria um produto PRÓPRIO ativo.
    let productId = typeof item.price.product === 'string' ? item.price.product : item.price.product.id
    let prodActive = false
    try { prodActive = (await stripe.products.retrieve(productId)).active } catch {}
    if (prodActive) {
      try { await stripe.products.update(productId, { name: `Lead4Producers CRM Pro — ${plan.label}` }) } catch {}
    } else {
      const fresh = await stripe.products.create({ name: `Lead4Producers CRM Pro — ${plan.label}` })
      productId = fresh.id
    }

    // Planos são "à vista a cada X meses" → a troca REINICIA o ciclo AGORA e FATURA na hora
    // (billing_cycle_anchor:'now' força uma fatura imediata do novo plano, com crédito proporcional
    // do tempo não usado do plano antigo). Sem isso a cobrança ia só pra próxima fatura.
    await stripe.subscriptions.update(sub.id, {
      items: [{
        id: item.id,
        price_data: {
          currency: 'usd',
          product: productId,
          unit_amount: plan.amountCents,
          recurring: { interval: plan.interval, interval_count: plan.intervalCount },
        },
      }],
      billing_cycle_anchor: 'now',
      proration_behavior: 'create_prorations',
      payment_behavior: 'error_if_incomplete',
      metadata: { ...sub.metadata, plan: plan.key, interval: plan.interval },
    })

    // Espelha já no buyer (o webhook também confirma)
    await db.from('buyers').update({ crm_billing_interval: plan.interval }).eq('id', buyer.id)

    return NextResponse.json({ ok: true, plan: plan.key, label: plan.label })
  } catch (error: any) {
    console.error('[CRM ChangePlan] Error:', error?.message)
    return NextResponse.json({ error: error?.message || 'Falha ao trocar de plano' }, { status: 500 })
  }
}
