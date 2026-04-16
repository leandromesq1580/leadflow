import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributeColdLeads } from '@/lib/cold-leads'
import Stripe from 'stripe'

/**
 * POST /api/webhook/stripe
 * Handle Stripe webhook events (payment completed, etc.)
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      const buyerId = session.metadata?.buyer_id
      const productType = session.metadata?.product_type as 'lead' | 'appointment'
      const quantity = parseInt(session.metadata?.quantity || '0', 10)
      const pricePerUnit = parseFloat(session.metadata?.price_per_unit || '0')

      if (!buyerId || !productType || !quantity) {
        console.error('[Stripe Webhook] Missing metadata:', session.metadata)
        break
      }

      console.log(`[Stripe Webhook] Payment completed: ${quantity} ${productType}s for buyer ${buyerId}`)

      // Create credits for buyer
      const { error: creditError } = await supabase.from('credits').insert({
        buyer_id: buyerId,
        type: productType,
        total_purchased: quantity,
        total_used: 0,
        price_per_unit: pricePerUnit,
        stripe_payment_id: session.payment_intent as string,
        purchased_at: new Date().toISOString(),
      })

      if (creditError) {
        console.error('[Stripe Webhook] Failed to create credits:', creditError)
      }

      // Record payment
      const { error: paymentError } = await supabase.from('payments').insert({
        buyer_id: buyerId,
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent as string,
        amount: (session.amount_total || 0) / 100,
        product_type: productType,
        quantity,
        price_per_unit: pricePerUnit,
        status: 'completed',
      })

      if (paymentError) {
        console.error('[Stripe Webhook] Failed to record payment:', paymentError)
      }

      // If cold_lead purchase, distribute cold leads immediately
      if (productType === 'cold_lead') {
        const distributed = await distributeColdLeads(buyerId, quantity)
        console.log(`[Stripe Webhook] Distributed ${distributed} cold leads to ${buyerId}`)

        // Update credits used count
        if (distributed > 0) {
          const { data: newCredit } = await supabase
            .from('credits')
            .select('id')
            .eq('buyer_id', buyerId)
            .eq('type', 'cold_lead')
            .order('purchased_at', { ascending: false })
            .limit(1)
            .single()

          if (newCredit) {
            await supabase.from('credits').update({ total_used: distributed }).eq('id', newCredit.id)
          }
        }
      }

      // Update buyer's Stripe customer ID if not set
      if (session.customer) {
        await supabase
          .from('buyers')
          .update({ stripe_customer_id: session.customer as string })
          .eq('id', buyerId)
          .is('stripe_customer_id', null)
      }

      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const buyerId = sub.metadata?.buyer_id
      if (buyerId) {
        const status = sub.status === 'active' || sub.status === 'trialing' ? 'active' : 'inactive'
        const expiresAt = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null
        await supabase.from('buyers').update({
          crm_plan: status === 'active' ? 'pro' : 'free',
          crm_subscription_id: sub.id,
          crm_subscription_status: status,
          crm_expires_at: expiresAt,
        }).eq('id', buyerId)
        console.log(`[Stripe Webhook] CRM subscription ${status} for ${buyerId}`)
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const buyerId = sub.metadata?.buyer_id
      if (buyerId) {
        await supabase.from('buyers').update({
          crm_plan: 'free',
          crm_subscription_status: 'cancelled',
        }).eq('id', buyerId)
        console.log(`[Stripe Webhook] CRM subscription cancelled for ${buyerId}`)
      }
      break
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      console.log(`[Stripe Webhook] Payment failed: ${paymentIntent.id}`)
      break
    }

    default:
      console.log(`[Stripe Webhook] Unhandled event: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}
