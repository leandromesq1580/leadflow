import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCrmPlan } from '@/lib/crm-plans'

/**
 * POST /api/checkout/subscription — Create Stripe Checkout for CRM Pro $99/mo
 */
export async function POST(request: NextRequest) {
  try {
    // Aceita `plan` (mensal/trimestral/semestral/anual). Compat: `interval` antigo (month/year).
    const body = await request.json().catch(() => ({}))
    let planKey: string | undefined = body.plan
    if (!planKey && body.interval) planKey = body.interval === 'year' ? 'anual' : 'mensal'
    const plan = getCrmPlan(planKey || 'mensal')
    if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = createAdminClient()
    const { data: buyer } = await db
      .from('buyers')
      .select('id, stripe_customer_id, email, name, crm_subscription_status')
      .eq('auth_user_id', user.id)
      .single()

    if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

    if (buyer.crm_subscription_status === 'active') {
      return NextResponse.json({ error: 'Already subscribed' }, { status: 400 })
    }

    const stripe = getStripe()

    // Create or reuse Stripe customer
    let customerId = buyer.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({ email: buyer.email, name: buyer.name, metadata: { buyer_id: buyer.id } })
      customerId = customer.id
      await db.from('buyers').update({ stripe_customer_id: customerId }).eq('id', buyer.id)
    }

    const description = `Pipeline, time, follow-ups + ${plan.leadsPerCycle} leads exclusivos + landing page exclusiva${plan.savingsPct ? ` — economia de ${plan.savingsPct}% vs mensal` : ''}`

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Lead4Producers CRM Pro — ${plan.label}`, description },
          unit_amount: plan.amountCents,
          recurring: { interval: plan.interval, interval_count: plan.intervalCount },
        },
        quantity: 1,
      }],
      metadata: { buyer_id: buyer.id, product_type: 'crm_pro', plan: plan.key, interval: plan.interval },
      subscription_data: { metadata: { buyer_id: buyer.id, plan: plan.key, interval: plan.interval } },
      success_url: 'https://lead4producers.com/dashboard?crm=activated',
      cancel_url: 'https://lead4producers.com/dashboard/credits?cancelled=true',
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[CRM Checkout] Error:', error?.message)
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 })
  }
}
