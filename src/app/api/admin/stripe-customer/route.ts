import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/stripe-customer?email=...&secret=...
 * Diagnóstico: lê AO VIVO na Stripe (chave do app) as cobranças, reembolsos,
 * payment intents e assinaturas de um comprador. Pra comparar com o nosso banco.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  if (url.searchParams.get('secret') !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const email = url.searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers')
    .select('id, name, email, stripe_customer_id, crm_subscription_id, crm_subscription_status, crm_plan')
    .ilike('email', email).maybeSingle()
  if (!buyer?.stripe_customer_id) return NextResponse.json({ error: 'sem stripe_customer_id', buyer })

  const stripe = getStripe()
  const cid = buyer.stripe_customer_id
  const out: any = { buyer }

  try {
    const ch = await stripe.charges.list({ customer: cid, limit: 25 })
    out.charges = ch.data.map(c => ({
      date: new Date(c.created * 1000).toISOString(),
      amount: c.amount / 100,
      status: c.status,
      paid: c.paid,
      refunded: c.refunded,
      amount_refunded: c.amount_refunded / 100,
      description: c.description,
      payment_intent: typeof c.payment_intent === 'string' ? c.payment_intent : null,
    }))
  } catch (e: any) { out.charges_error = e?.message }

  try {
    const subs = await stripe.subscriptions.list({ customer: cid, status: 'all', limit: 10 })
    out.subscriptions = subs.data.map((s: any) => {
      const price = s.items?.data?.[0]?.price
      const rec = price?.recurring
      return {
        id: s.id, status: s.status,
        created: new Date(s.created * 1000).toISOString(),
        proxima_cobranca: s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null,
        interval: rec?.interval || null,
        interval_count: rec?.interval_count || null,
        valor: price?.unit_amount != null ? price.unit_amount / 100 : null,
        renova_automatico: !s.cancel_at_period_end,
      }
    })
  } catch (e: any) { out.subs_error = e?.message }

  try {
    const inv = await stripe.invoices.list({ customer: cid, limit: 25 })
    out.invoices = inv.data.map((i: any) => ({ id: i.id, date: new Date(i.created * 1000).toISOString(), amount_paid: (i.amount_paid || 0) / 100, status: i.status, reason: i.billing_reason }))
  } catch (e: any) { out.invoices_error = e?.message }

  try {
    const whs = await stripe.webhookEndpoints.list({ limit: 10 })
    out.webhooks = whs.data.map((w: any) => ({ url: w.url, status: w.status, events: w.enabled_events }))
  } catch (e: any) { out.webhooks_error = e?.message }

  // o que o NOSSO banco tem desse buyer (pra comparar)
  const { data: ourPayments } = await db.from('payments').select('amount, product_type, status, created_at, stripe_session_id').eq('buyer_id', buyer.id).order('created_at', { ascending: false })
  out.nosso_banco_payments = ourPayments

  return NextResponse.json(out)
}
