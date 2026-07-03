import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Sidebar } from '@/components/dashboard/sidebar'
import { PwaRegister } from '@/components/pwa-register'
import { TrialBanner } from '@/components/trial-banner'
import { MeetingBanner } from '@/components/dashboard/meeting-banner'
import { ImpersonationBanner } from '@/components/dashboard/impersonation-banner'
import { SuspendedAccount } from '@/components/dashboard/suspended-account'
import { MetaPixel } from '@/components/meta-pixel'
import { TutorChat } from '@/components/tutor-chat'
import { MobileNav } from '@/components/dashboard/mobile-nav'
import { ResumeCheckout } from '@/components/resume-checkout'
import { cookies } from 'next/headers'
import { isTrialActive, trialDaysRemaining, isAppointmentOnly, isLeadOnly } from '@/lib/crm-access'
import { AppointmentGate } from '@/components/dashboard/appointment-gate'
import { LeadGate } from '@/components/dashboard/lead-gate'
import { getLocale } from '@/lib/locale'
import { I18nProvider } from '@/lib/i18n-client'
import { PrivacyProvider } from '@/lib/privacy-mode'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let shouldRedirect = false

  const supabase = await createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) shouldRedirect = true

  if (shouldRedirect) redirect('/login')

  const db = createAdminClient()
  let { data: buyer } = await db
    .from('buyers')
    .select('id, name, is_admin, is_agency, is_active, crm_plan, trial_ends_at')
    .eq('auth_user_id', user!.id)
    .single()
  // Fallback se a migration trial_ends_at ainda não tiver sido aplicada
  if (!buyer) {
    const fb = await db.from('buyers').select('id, name, is_admin, is_agency, is_active, crm_plan').eq('auth_user_id', user!.id).single()
    buyer = fb.data as any
  }

  // Conta suspensa (is_active=false) → bloqueia acesso à plataforma inteira.
  // Admin nunca é bloqueado. is_active null/undefined = conta antiga = liberada.
  if (buyer && buyer.is_active === false && buyer.is_admin !== true) {
    return <SuspendedAccount name={buyer.name || user!.email || ''} />
  }

  const showTrial = isTrialActive(buyer)
  const daysLeft = trialDaysRemaining(buyer)
  const apptOnly = isAppointmentOnly(buyer)
  const leadOnly = isLeadOnly(buyer)
  const locale = await getLocale()

  // "Ver como": admin vendo o sistema na pele de outro usuário
  const impAsRaw = (await cookies()).get('l4p-imp-as')?.value
  const impAs = impAsRaw ? decodeURIComponent(impAsRaw) : null

  return (
    <I18nProvider locale={locale}>
      <PrivacyProvider>
      <div className="flex min-h-screen" style={{ background: '#f8f9fc' }}>
        <div className="hidden md:block">
          <Sidebar type="buyer" userName={buyer?.name || user!.email || ''} isAgency={buyer?.is_agency || false} buyerId={buyer?.id} crmPlan={buyer?.crm_plan || 'free'} isAdmin={!!buyer?.is_admin} />
        </div>
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-auto" data-crm-plan={buyer?.crm_plan || 'free'}>
          {impAs && <ImpersonationBanner name={impAs} />}
          {buyer?.id && <MeetingBanner buyerId={buyer.id} />}
          {showTrial && <TrialBanner daysLeft={daysLeft} />}
          <AppointmentGate active={apptOnly}>
            <LeadGate active={leadOnly}>
              {children}
            </LeadGate>
          </AppointmentGate>
        </main>
        {buyer?.id && <PwaRegister buyerId={buyer.id} />}
        <MobileNav userName={buyer?.name || user!.email || ''} isAgency={buyer?.is_agency || false} buyerId={buyer?.id} crmPlan={buyer?.crm_plan || 'free'} isAdmin={!!buyer?.is_admin} />
        <TutorChat />
        <MetaPixel />
        <ResumeCheckout />
      </div>
      </PrivacyProvider>
    </I18nProvider>
  )
}
