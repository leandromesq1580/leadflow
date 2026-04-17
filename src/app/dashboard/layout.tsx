import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Sidebar } from '@/components/dashboard/sidebar'
import { PwaRegister } from '@/components/pwa-register'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let shouldRedirect = false

  const supabase = await createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) shouldRedirect = true

  if (shouldRedirect) redirect('/login')

  const db = createAdminClient()
  const { data: buyer } = await db
    .from('buyers')
    .select('id, name, is_admin, is_agency, crm_plan')
    .eq('auth_user_id', user!.id)
    .single()

  return (
    <div className="flex min-h-screen" style={{ background: '#f8f9fc' }}>
      <div className="hidden md:block">
        <Sidebar type="buyer" userName={buyer?.name || user!.email || ''} isAgency={buyer?.is_agency || false} />
      </div>
      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-auto" data-crm-plan={buyer?.crm_plan || 'free'}>
        {children}
      </main>
      {buyer?.id && <PwaRegister buyerId={buyer.id} />}
    </div>
  )
}
