import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { CrmGate } from '@/components/crm-gate'

export const dynamic = 'force-dynamic'

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('crm_plan, is_admin').eq('auth_user_id', user.id).single()

  const hasAccess = buyer?.crm_plan === 'pro' || buyer?.is_admin === true

  return <CrmGate hasAccess={hasAccess}>{children}</CrmGate>
}
