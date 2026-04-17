import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** POST /api/admin/buyers/[id]/toggle-crm — manually grant/revoke CRM Pro */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminDb = createAdminClient()
  const { data: me } = await adminDb.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { active } = await request.json()
  await adminDb.from('buyers').update({
    crm_plan: active ? 'pro' : 'free',
    crm_subscription_status: active ? 'active' : 'cancelled',
  }).eq('id', id)

  return NextResponse.json({ success: true })
}
