import { NextRequest, NextResponse } from 'next/server'
import { getStripe, PRODUCTS, type ProductType } from '@/lib/stripe'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { packageId } = await request.json()

    // 🚫 Appointments não são mais vendidos (jul/2026). Bloqueia qualquer tentativa de
    // checkout de pacote de appointment mesmo que venha por request forjado/link antigo.
    if (typeof packageId === 'string' && packageId.startsWith('appt')) {
      return NextResponse.json({ error: 'Appointments não estão mais disponíveis para compra.' }, { status: 400 })
    }

    // Find package
    let selectedPackage = null
    let productType: ProductType | null = null

    for (const [type, product] of Object.entries(PRODUCTS)) {
      const pkg = product.packages.find((p) => p.id === packageId)
      if (pkg) {
        selectedPackage = pkg
        productType = type as ProductType
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
    const baseParams = {
      mode: 'payment' as const,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${PRODUCTS[productType].name} — ${selectedPackage.quantity}x`,
              description: `${selectedPackage.quantity} ${productType === 'cold_lead' ? 'leads frios' : 'leads exclusivos'} · ${buyer.name || buyer.email}`,
            },
            unit_amount: selectedPackage.unitPriceCents,
          },
          quantity: selectedPackage.quantity,
        },
      ],
      metadata: {
        buyer_id: buyer.id,
        buyer_name: buyer.name || '',
        buyer_email: buyer.email || '',
        product_type: productType,
        quantity: String(selectedPackage.quantity),
        price_per_unit: String(selectedPackage.pricePerUnit),
        package_id: selectedPackage.id,
      },
      payment_intent_data: {
        description: `${selectedPackage.quantity}x ${PRODUCTS[productType].name} — ${buyer.name || buyer.email}`,
      },
      success_url: 'https://lead4producers.com/dashboard/credits?success=true',
      cancel_url: 'https://lead4producers.com/dashboard/credits?cancelled=true',
    }

    let session
    try {
      session = await stripe.checkout.sessions.create({
        ...baseParams,
        customer: buyer.stripe_customer_id || undefined,
        customer_email: !buyer.stripe_customer_id ? buyer.email : undefined,
      })
    } catch (e: any) {
      // stripe_customer_id criado em TEST mode mas key é LIVE (resíduo da migração
      // test→live). Limpa o id inválido e refaz com email — o webhook associa o
      // novo customer live depois. Recuperação transparente (cliente não vê erro).
      if (/No such customer|similar object exists in test mode/i.test(e?.message || '')) {
        await db.from('buyers').update({ stripe_customer_id: null }).eq('id', buyer.id)
        session = await stripe.checkout.sessions.create({ ...baseParams, customer_email: buyer.email })
      } else {
        throw e
      }
    }

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[Checkout] Error:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Failed to create checkout' }, { status: 500 })
  }
}
