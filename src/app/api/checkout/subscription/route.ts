import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/checkout/subscription — Create Stripe Checkout for CRM Pro $99/mo
 */
export async function POST(request: NextRequest) {
  try {
    const { interval = 'month' } = await request.json().catch(() => ({}))
    if (!['month', 'year'].includes(interval)) {
      return NextResponse.json({ error: 'Invalid interval' }, { status: 400 })
    }

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

    // Pricing: $99/mo or $950/yr (~20% discount vs $1188 monthly)
    const isYearly = interval === 'year'
    const unitAmount = isYearly ? 95000 : 9900
    const description = isYearly
      ? 'Pipeline, Gestao de Time, Follow-ups — anual com 20% off'
      : 'Pipeline, Gestao de Time, Follow-ups, Anexos e mais'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Lead4Producers CRM Pro (${isYearly ? 'Anual' : 'Mensal'})`, description },
          unit_amount: unitAmount,
          recurring: { interval: isYearly ? 'year' : 'month' },
        },
        quantity: 1,
      }],
      metadata: { buyer_id: buyer.id, product_type: 'crm_pro', interval },
      subscription_data: { metadata: { buyer_id: buyer.id, interval } },
      success_url: 'https://lead4producers.com/dashboard?crm=activated',
      cancel_url: 'https://lead4producers.com/dashboard/credits?cancelled=true',
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[CRM Checkout] Error:', error?.message)
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 })
  }
}
