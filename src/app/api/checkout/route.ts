import { NextRequest, NextResponse } from 'next/server'
import { getStripe, PRODUCTS, type ProductType } from '@/lib/stripe'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCoupon } from '@/lib/coupons'
import { hasAcceptedCurrentPolicy } from '@/lib/policies'
import { discountForOrder } from '@/lib/referral'
import { readSalesTeamPricing, purchaseUnitPrice, NO_TEAM_PRICING } from '@/lib/sales-team-pricing'
import { isLeadLanguage, leadLanguageLabel } from '@/lib/lead-language'

export async function POST(request: NextRequest) {
  try {
    const { packageId, couponCode, leadLanguage } = await request.json()

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

    // Product language is required even if the portal itself is already in Spanish.
    if (!isLeadLanguage(leadLanguage)) {
      return NextResponse.json({ error: 'Escolha Leads BR (português) ou Leads em espanhol antes de comprar.', code: 'LEAD_LANGUAGE_REQUIRED' }, { status: 400 })
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

    // 🔏 CLICKWRAP (2026-07-28): sem aceite da política vigente, sem compra.
    // (Gate inerte até a migration 033 rodar — não quebra vendas no deploy.)
    if (!(await hasAcceptedCurrentPolicy(db, buyer.id))) {
      return NextResponse.json({
        error: 'Antes de comprar, leia e aceite a Política de Leads e Uso (caixa de aceite na página de compra).',
        policy_required: true,
      }, { status: 412 })
    }

    // Cupom da plataforma (só pacotes de LEAD): validado server-side por email do
    // comprador; força o preço por lead no unit_amount. Cupom inválido/de outra conta
    // é simplesmente ignorado (compra segue no preço de tabela).
    const coupon = productType === 'lead' ? resolveCoupon(couponCode, buyer.email) : null
    const teamPricing = productType === 'lead' ? await readSalesTeamPricing(db, buyer.id) : NO_TEAM_PRICING
    const quote = purchaseUnitPrice(productType, selectedPackage.unitPriceCents, teamPricing, coupon)
    const unitPriceCents = quote.unitPriceCents
    const pricePerUnit = unitPriceCents / 100

    // 🎁 CRÉDITO DE INDICAÇÃO como desconto (regra 2026-07-30): cobre até 50% do pedido
    // de LEADS. Vai como coupon one-time (o cliente vê o desconto no checkout) e o
    // débito real do saldo acontece no webhook, quando o pagamento CONFIRMA.
    const orderCents = unitPriceCents * selectedPackage.quantity
    const referralDiscount = await discountForOrder(db, buyer.id, orderCents)

    // Create Stripe Checkout Session
    const stripe = getStripe()
    const baseParams = {
      mode: 'payment' as const,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${PRODUCTS[productType].name} — ${leadLanguageLabel(leadLanguage)} — ${selectedPackage.quantity}x`,
              description: `${selectedPackage.quantity} ${productType === 'cold_lead' ? 'leads frios' : 'leads exclusivos'} · ${leadLanguageLabel(leadLanguage)} · ${buyer.name || buyer.email}${quote.source === 'sales_team' ? ' · preço de equipe' : quote.couponCode ? ` · cupom ${quote.couponCode}` : ''}`,
            },
            unit_amount: unitPriceCents,
          },
          quantity: selectedPackage.quantity,
        },
      ],
      metadata: {
        buyer_id: buyer.id,
        buyer_name: buyer.name || '',
        buyer_email: buyer.email || '',
        product_type: productType,
        lead_language: leadLanguage,
        quantity: String(selectedPackage.quantity),
        price_per_unit: String(pricePerUnit),
        package_id: selectedPackage.id,
        coupon: quote.couponCode,
        price_source: quote.source,
        sales_team_member: String(teamPricing.is_member),
        referral_discount_cents: String(referralDiscount),
      },
      payment_intent_data: {
        description: `${selectedPackage.quantity}x ${PRODUCTS[productType].name} — ${leadLanguageLabel(leadLanguage)} — ${buyer.name || buyer.email}`,
        metadata: { buyer_id: buyer.id, package_id: selectedPackage.id, lead_language: leadLanguage },
      },
      success_url: 'https://lead4producers.com/dashboard/credits?success=true',
      cancel_url: 'https://lead4producers.com/dashboard/credits?cancelled=true',
    }

    // coupon one-time do desconto de indicação (criado só quando há crédito)
    let discountParam: { discounts: { coupon: string }[] } | Record<string, never> = {}
    if (referralDiscount > 0) {
      try {
        const c = await stripe.coupons.create({
          amount_off: referralDiscount, currency: 'usd', duration: 'once',
          name: 'Crédito de indicação',
        })
        discountParam = { discounts: [{ coupon: c.id }] }
      } catch (e: any) {
        console.warn('[Checkout] coupon de indicação falhou:', e?.message)
      }
    }

    let session
    try {
      session = await stripe.checkout.sessions.create({
        ...baseParams,
        ...discountParam,
        customer: buyer.stripe_customer_id || undefined,
        customer_email: !buyer.stripe_customer_id ? buyer.email : undefined,
      })
    } catch (e: any) {
      // stripe_customer_id criado em TEST mode mas key é LIVE (resíduo da migração
      // test→live). Limpa o id inválido e refaz com email — o webhook associa o
      // novo customer live depois. Recuperação transparente (cliente não vê erro).
      if (/No such customer|similar object exists in test mode/i.test(e?.message || '')) {
        await db.from('buyers').update({ stripe_customer_id: null }).eq('id', buyer.id)
        session = await stripe.checkout.sessions.create({ ...baseParams, ...discountParam, customer_email: buyer.email })
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
