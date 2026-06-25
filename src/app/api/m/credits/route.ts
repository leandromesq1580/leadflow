import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPurchased } from '@/lib/starter'

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
  const { data: buyer } = await db.from('buyers').select('id, crm_plan, crm_subscription_status').eq('auth_user_id', user.id).single()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  let history: any[] = []
  try { const { data } = await db.from('credits').select('id, type, total_purchased, total_used, price_per_unit, purchased_at').eq('buyer_id', buyer.id).order('purchased_at', { ascending: false }); history = data || [] } catch {}

  const sum = (type: string) => history.filter(c => c.type === type).reduce((s, c) => s + ((c.total_purchased || 0) - (c.total_used || 0)), 0)
  let starterEligible = true
  try { starterEligible = !(await hasPurchased(db, buyer.id)) } catch {}

  return NextResponse.json({
    totalLeads: sum('lead'),
    totalAppts: sum('appointment'),
    crm_plan: buyer.crm_plan || 'free',
    crm_subscription_status: buyer.crm_subscription_status || null,
    starterEligible,
    history,
  })
}
