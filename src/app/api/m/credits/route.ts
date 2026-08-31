import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { buildPurchaseHistory } from '@/lib/purchase-history'
import { readSalesTeamPricing } from '@/lib/sales-team-pricing'

export const dynamic = 'force-dynamic'

/**
 * GET /api/m/credits — pro app mobile. Buyer pela SESSÃO. Espelha a query do
 * server component dashboard/credits (não existe GET /api/credits).
 */
export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id, crm_plan, crm_subscription_status, crm_subscription_id').eq('auth_user_id', user.id).single()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
  let teamPricing
  try { teamPricing = await readSalesTeamPricing(db, buyer.id) }
  catch { return NextResponse.json({ error: 'Pricing unavailable' }, { status: 503 }) }

  const [creditsRes, paymentsRes] = await Promise.all([
    db.from('credits')
      .select('id, type, total_purchased, total_used, price_per_unit, purchased_at, stripe_payment_id, lead_language')
      .eq('buyer_id', buyer.id)
      .order('purchased_at', { ascending: false }),
    db.from('payments')
      .select('id, amount, product_type, quantity, price_per_unit, status, created_at, stripe_session_id, stripe_payment_intent_id, lead_language')
      .eq('buyer_id', buyer.id)
      .order('created_at', { ascending: false }),
  ])
  const creditRows = creditsRes.data || []
  const history = buildPurchaseHistory(paymentsRes.data || [], creditRows)

  const sum = (type: string) => creditRows.filter(c => c.type === type).reduce((s, c) => s + ((c.total_purchased || 0) - (c.total_used || 0)), 0)

  // Plano exato do assinante ativo (só existe no metadata da assinatura Stripe)
  let crm_plan_key: string | null = null
  if (buyer.crm_subscription_status === 'active' && buyer.crm_subscription_id) {
    try { const sub = await getStripe().subscriptions.retrieve(buyer.crm_subscription_id); crm_plan_key = (sub.metadata?.plan as string) || null } catch {}
  }

  return NextResponse.json({
    totalLeads: sum('lead'),
    leadsByLanguage: Object.fromEntries(['pt', 'es'].map(language => [language, creditRows.filter(c => c.type === 'lead' && c.lead_language === language).reduce((s, c) => s + c.total_purchased - c.total_used, 0)])),
    totalAppts: sum('appointment'),
    crm_plan: buyer.crm_plan || 'free',
    crm_subscription_status: buyer.crm_subscription_status || null,
    crm_plan_key,
    history,
    teamPricing,
  }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } })
}
