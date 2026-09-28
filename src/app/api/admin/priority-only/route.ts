import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateLeadRouting } from '@/lib/lead-routing-settings'

export async function PATCH(request: Request) {
  const session = await createServerSupabase()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  const { data: admin, error } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (error || !admin?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.priority_only !== 'boolean' || Object.keys(body).some(key => key !== 'priority_only')) {
    return NextResponse.json({ error: 'Informe somente priority_only como booleano.' }, { status: 400 })
  }
  try {
    const value = await updateLeadRouting(db, current => ({ ...current, priority_only: body.priority_only }))
    // Return only the rule fields displayed by this control, never all settings.
    const rule = value.admin_rule as Record<string, unknown> | undefined
    return NextResponse.json({ priority_only: value.priority_only, admin_rule: rule ? {
      admin_emails: rule.admin_emails, one_in: rule.one_in,
      daily_quota: rule.daily_quota, daily_max: rule.daily_max,
    } : null }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar. Atualize e tente novamente.' }, { status: 503 })
  }
}
