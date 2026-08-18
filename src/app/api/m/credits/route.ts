import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'

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

  let history: any[] = []
  try { const { data } = await db.from('credits').select('id, type, total_purchased, total_used, price_per_unit, purchased_at').eq('buyer_id', buyer.id).order('purchased_at', { ascending: false }); history = data || [] } catch {}

  const sum = (type: string) => history.filter(c => c.type === type).reduce((s, c) => s + ((c.total_purchased || 0) - (c.total_used || 0)), 0)

  // Origem da assinatura ativa. Assinatura via Apple (IAP) grava id "apple:<txid>";
  // via Stripe grava o id da subscription do Stripe. O app usa isso pra dizer ONDE
  // gerenciar (Ajustes do iPhone p/ Apple; conta no site p/ Stripe) — sem isso, um
  // assinante Stripe no app nativo via a instrução errada ("gerencie nos Ajustes").
  const subId = buyer.crm_subscription_id || ''
  const isApple = subId.startsWith('apple:')
  const sub_source: 'apple' | 'stripe' | null =
    buyer.crm_subscription_status === 'active' ? (isApple ? 'apple' : subId ? 'stripe' : null) : null

  // Plano exato do assinante ativo (só existe no metadata da assinatura Stripe — não p/ Apple)
  let crm_plan_key: string | null = null
  if (buyer.crm_subscription_status === 'active' && subId && !isApple) {
    try { const sub = await getStripe().subscriptions.retrieve(subId); crm_plan_key = (sub.metadata?.plan as string) || null } catch {}
  }

  return NextResponse.json({
    totalLeads: sum('lead'),
    totalAppts: sum('appointment'),
    crm_plan: buyer.crm_plan || 'free',
    crm_subscription_status: buyer.crm_subscription_status || null,
    crm_plan_key,
    sub_source,
    history,
  })
}
