import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/apolices/checkout — assinatura do add-on Gestão de Apólices ($39/mês).
 * Separado do CRM: é uma SEGUNDA assinatura no mesmo customer, marcada com
 * metadata.addon='apolices' — o webhook usa essa marca pra (1) não tratar como
 * CRM, (2) não deixar o guard de 1-assinatura-por-cliente cancelar a irmã.
 */
const ADDON_APOLICES_CENTS = 3900 // $39/mês — âncora: AgencyBloc $109/usuário; 1 chargeback evitado paga anos

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

    // já tem o add-on ativo? não cobra duas vezes
    const { data: addonRow } = await db.from('settings').select('value').eq('key', 'apolices_addon').maybeSingle()
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
            name: 'Lead4Producers — Gestão de Apólices (add-on)',
            description: 'Seu book sincronizado com o portal da seguradora: pendências, dívidas e risco de chargeback, todo dia',
          },
          unit_amount: ADDON_APOLICES_CENTS,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      metadata: { buyer_id: buyer.id, addon: 'apolices' },
      subscription_data: { metadata: { buyer_id: buyer.id, addon: 'apolices' } },
      success_url: 'https://lead4producers.com/dashboard/apolices?addon=ok',
      cancel_url: 'https://lead4producers.com/dashboard/apolices?cancelled=1',
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('[Apolices Checkout] Error:', error?.message)
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 })
  }
}
