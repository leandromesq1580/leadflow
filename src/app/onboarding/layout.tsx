import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLocale } from '@/lib/locale'
import { I18nProvider } from '@/lib/i18n-client'
import { PolicyAcceptanceGate } from '@/components/policy-acceptance-gate'
import { hasAcceptedCurrentPolicy } from '@/lib/policies'

export const dynamic = 'force-dynamic'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id').eq('auth_user_id', user.id).maybeSingle()
  const locale = await getLocale()
  if (buyer?.id && !(await hasAcceptedCurrentPolicy(db, buyer.id))) {
    return (
      <I18nProvider locale={locale}>
        <PolicyAcceptanceGate context="onboarding_required" />
      </I18nProvider>
    )
  }

  return children
}
