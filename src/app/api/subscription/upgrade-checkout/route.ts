import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCrmPlan, CRM_PLAN_LIST } from '@/lib/crm-plans'

/**
 * POST /api/subscription/upgrade-checkout  { plan }
 * UPGRADE de plano CRM: abre um Stripe Checkout do NOVO plano com um CUPOM = valor do plano
 * atual (uma vez), então o cliente paga só a DIFERENÇA agora e o novo ciclo começa hoje.
 * A troca só se aplica DEPOIS do pagamento (webhook cancela a assinatura antiga). Até lá,
 * o cliente continua no plano que está pagando.
 * DOWNGRADE (novo valor <= atual): troca direto, sem cobrança.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const plan = getCrmPlan(body?.plan)
    if (!plan) return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })

    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const db = createAdminClient()
    const { data: buyer } = await db
      .from('buyers')
      .select('id, stripe_customer_id, email, name, crm_subscription_id, crm_subscription_status')
      .eq('auth_user_id', user.id)
      .single()
    if (!buyer) return NextResponse.json({ error: 'Buyer não encontrado' }, { status: 404 })
    if (buyer.crm_subscription_status !== 'active' || !buyer.crm_subscription_id) {
      return NextResponse.json({ error: 'Sem assinatura ativa pra trocar. Assine um plano primeiro.' }, { status: 400 })
    }

    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(buyer.crm_subscription_id)
    if (sub.status !== 'active') return NextResponse.json({ error: 'Sua assinatura não está ativa no Stripe.' }, { status: 400 })
    const item = sub.items.data[0]
    const price: any = item.price

    // Plano atual: metadata OU derivado do preço real.
    let currentKey = (sub.metadata?.plan as string) || null
    if (!currentKey || !getCrmPlan(currentKey)) {
      currentKey = CRM_PLAN_LIST.find(p => p.amountCents === price.unit_amount && p.interval === price.recurring?.interval && (price.recurring?.interval_count || 1) === p.intervalCount)?.key || null
    }
    const currentPlan = currentKey ? getCrmPlan(currentKey) : null
    if (currentKey === plan.key) return NextResponse.json({ error: 'Você já está nesse plano.' }, { status: 400 })

    const currentAmount = currentPlan?.amountCents ?? 0
    const diff = plan.amountCents - currentAmount

    // DOWNGRADE ou mesmo valor: troca direto, sem cobrança.
    if (diff <= 0) {
      let productId = typeof price.product === 'string' ? price.product : price.product.id
      try { if (!(await stripe.products.retrieve(productId)).active) productId = (await stripe.products.create({ name: `Lead4Producers CRM Pro — ${plan.label}` })).id } catch { productId = (await stripe.products.create({ name: `Lead4Producers CRM Pro — ${plan.label}` })).id }
      await stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price_data: { currency: 'usd', product: productId, unit_amount: plan.amountCents, recurring: { interval: plan.interval, interval_count: plan.intervalCount } } }],
        proration_behavior: 'none',
        metadata: { ...sub.metadata, plan: plan.key, interval: plan.interval },
      })
      await db.from('buyers').update({ crm_billing_interval: plan.interval }).eq('id', buyer.id)
      return NextResponse.json({ switched: true, plan: plan.key, downgrade: true })
    }

    // UPGRADE: checkout do novo plano com cupom = valor do atual (1x) → paga a DIFERENÇA.
    let customerId = buyer.stripe_customer_id
    if (!customerId) {
      const c = await stripe.customers.create({ email: buyer.email, name: buyer.name, metadata: { buyer_id: buyer.id } })
      customerId = c.id
      await db.from('buyers').update({ stripe_customer_id: customerId }).eq('id', buyer.id)
    }

    const discounts: { coupon: string }[] = []
    if (currentAmount > 0) {
      const coupon = await stripe.coupons.create({ amount_off: currentAmount, currency: 'usd', duration: 'once', name: `Crédito ${currentPlan!.label}` })
      discounts.push({ coupon: coupon.id })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Lead4Producers CRM Pro — ${plan.label}`, description: `Upgrade do ${currentPlan?.label || 'plano atual'} pro ${plan.label} — você paga só a diferença agora` },
          unit_amount: plan.amountCents,
          recurring: { interval: plan.interval, interval_count: plan.intervalCount },
        },
        quantity: 1,
      }],
      discounts,
      subscription_data: { metadata: { buyer_id: buyer.id, plan: plan.key, interval: plan.interval } },
      metadata: { buyer_id: buyer.id, product_type: 'crm_pro', plan: plan.key, kind: 'crm_upgrade', old_subscription_id: sub.id },
      success_url: 'https://lead4producers.com/dashboard/credits?upgraded=1',
      cancel_url: 'https://lead4producers.com/dashboard/credits?cancelled=true',
    })

    return NextResponse.json({ url: session.url, diff })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Falha ao iniciar upgrade' }, { status: 500 })
  }
}
