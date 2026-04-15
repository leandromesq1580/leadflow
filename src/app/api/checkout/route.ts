import { NextRequest, NextResponse } from 'next/server'
import { getStripe, PRODUCTS } from '@/lib/stripe'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { packageId } = await request.json()

    // Find package
    let selectedPackage = null
    let productType: 'lead' | 'appointment' | null = null

    for (const [type, product] of Object.entries(PRODUCTS)) {
      const pkg = product.packages.find((p) => p.id === packageId)
      if (pkg) {
        selectedPackage = pkg
        productType = type as 'lead' | 'appointment'
        break
      }
    }

    if (!selectedPackage || !productType) {
      return NextResponse.json({ error: 'Invalid package' }, { status: 400 })
    }

    // Get user from auth
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get buyer with admin client (bypass RLS)
    const db = createAdminClient()
    const { data: buyer } = await db
      .from('buyers')
      .select('id, stripe_customer_id, email, name')
      .eq('auth_user_id', user.id)
      .single()

    if (!buyer) {
      return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
    }

    // Create Stripe Checkout Session
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: buyer.stripe_customer_id || undefined,
      customer_email: !buyer.stripe_customer_id ? buyer.email : undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${PRODUCTS[productType].name} — ${selectedPackage.quantity}x`,
              description: `${selectedPackage.quantity} ${productType === 'lead' ? 'leads exclusivos' : 'appointments agendados'}`,
            },
            unit_amount: selectedPackage.unitPriceCents,
          },
          quantity: selectedPackage.quantity,
        },
      ],
      metadata: {
        buyer_id: buyer.id,
        product_type: productType,
        quantity: String(selectedPackage.quantity),
        price_per_unit: String(selectedPackage.pricePerUnit),
        package_id: selectedPackage.id,
      },
      success_url: 'https://leadflow-five-tawny.vercel.app/dashboard/credits?success=true',
      cancel_url: 'https://leadflow-five-tawny.vercel.app/dashboard/credits?cancelled=true',
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[Checkout] Error:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Failed to create checkout' }, { status: 500 })
  }
}
