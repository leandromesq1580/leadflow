import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/buyers/[id]/set-plan
 * Body: { plan: 'free' | 'appointment' | 'pro' }
 * Define o tier do comprador manualmente (admin).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminDb = createAdminClient()
  const { data: me } = await adminDb.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { plan } = await request.json()
  if (!['free', 'appointment', 'pro'].includes(plan)) {
    return NextResponse.json({ error: 'plan deve ser free, appointment ou pro' }, { status: 400 })
  }

  const update: Record<string, unknown> = {
    crm_plan: plan,
    crm_subscription_status: plan === 'pro' ? 'active' : 'cancelled',
  }
  // free/appointment não devem re-liberar CRM via trial residual
  if (plan !== 'pro') update.trial_ends_at = null

  const { error } = await adminDb.from('buyers').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, plan })
}
