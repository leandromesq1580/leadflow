import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/roteiro/checkout — assinatura do add-on "IA na Ligação" ($49/mês).
 * Mesma mecânica do add-on de Apólices: segunda assinatura no mesmo customer com
 * metadata.addon='ia_ligacao'; o webhook liga settings.ia_ligacao_addon e o gate
 * da transcrição em /api/voice/outbound passa a incluir o buyer.
 * Franquia fair-use: 600 min de escuta/mês (medidos em settings ia_uso:<id>:<mês>).
 */
const ADDON_IA_CENTS = 4900 // $49/mês — âncora: Balto/Cresta $50-150/seat enterprise

export async function POST() {
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

    const { data: addonRow } = await db.from('settings').select('value').eq('key', 'ia_ligacao_addon').maybeSingle()
    if (((addonRow?.value as Record<string, { active?: boolean }>) || {})[buyer.id]?.active) {
      return NextResponse.json({ error: 'Add-on já ativo nesta conta.' }, { status: 400 })
    }

    const stripe = getStripe()
    let customerId = buyer.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({ email: buyer.email, name: buyer.name, metadata: { buyer_id: buyer.id } })
      customerId = customer.id
      await db.from('buyers').update({ stripe_customer_id: customerId }).eq('id', buyer.id)
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Lead4Producers — IA na Ligação (add-on)',
            description: 'A IA escuta sua ligação ao vivo e sugere a resposta do seu script na hora — inclui 600 min/mês de escuta',
          },
          unit_amount: ADDON_IA_CENTS,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      metadata: { buyer_id: buyer.id, addon: 'ia_ligacao' },
      subscription_data: { metadata: { buyer_id: buyer.id, addon: 'ia_ligacao' } },
      success_url: 'https://lead4producers.com/dashboard/roteiro?addon=ok',
      cancel_url: 'https://lead4producers.com/dashboard/roteiro?cancelled=1',
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[Roteiro Checkout] Error:', error?.message)
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 })
  }
}
