import './m-theme.css'
import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLocale } from '@/lib/locale'
import { I18nProvider } from '@/lib/i18n-client'
import { PrivacyProvider } from '@/lib/privacy-mode'
import { PwaRegister } from '@/components/pwa-register'
import { SuspendedAccount } from '@/components/dashboard/suspended-account'
import { MobileBottomNav } from '@/components/mobile/bottom-nav'
import { MHeader } from '@/components/mobile/m-header'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Lead4Pro',
  manifest: '/manifest-mobile.json',
  appleWebApp: { capable: true, title: 'Lead4Pro', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icon-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#0b0b12',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/m-login?redirect=/m')

  const db = createAdminClient()
  let { data: buyer } = await db
    .from('buyers')
    .select('id, name, is_admin, is_agency, is_active, crm_plan, trial_ends_at')
    .eq('auth_user_id', user.id)
    .single()
  if (!buyer) {
    const fb = await db.from('buyers').select('id, name, is_admin, is_agency, is_active, crm_plan').eq('auth_user_id', user.id).single()
    buyer = fb.data as any
  }

  // Conta suspensa → bloqueia (mesma regra do desktop). Admin nunca é bloqueado.
  if (buyer && buyer.is_active === false && buyer.is_admin !== true) {
    return <SuspendedAccount name={buyer.name || user.email || ''} />
  }

  const locale = await getLocale()

  return (
    <I18nProvider locale={locale}>
      <PrivacyProvider>
        <div className="m-root m-tap">
          <div className="m-scroll">
            <div className="m-shell">
              <MHeader userName={buyer?.name || user.email || ''} />
              {children}
            </div>
          </div>
          <MobileBottomNav buyerId={buyer?.id} crmPlan={buyer?.crm_plan || 'free'} />
          {buyer?.id && <PwaRegister buyerId={buyer.id} />}
        </div>
      </PrivacyProvider>
    </I18nProvider>
  )
}
