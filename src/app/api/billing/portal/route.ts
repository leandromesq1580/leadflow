import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/billing/portal
 * Creates a Stripe Customer Portal session so users can:
 * - Update card
 * - View invoices
 * - Cancel subscription
 * - Update billing email
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const db = createAdminClient()
    const { data: buyer } = await db
      .from('buyers')
      .select('id, stripe_customer_id, email, name')
      .eq('auth_user_id', user.id)
      .single()

    if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

    const stripe = getStripe()

    // Ensure customer exists
    let customerId = buyer.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: buyer.email,
        name: buyer.name,
        metadata: { buyer_id: buyer.id },
      })
      customerId = customer.id
      await db.from('buyers').update({ stripe_customer_id: customerId }).eq('id', buyer.id)
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: 'https://lead4producers.com/dashboard/credits',
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[Billing Portal] Error:', err?.message)
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
