import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Sidebar } from '@/components/dashboard/sidebar'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let shouldRedirect = false

  const supabase = await createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) shouldRedirect = true

  if (shouldRedirect) redirect('/login')

  const db = createAdminClient()
  const { data: buyer } = await db
    .from('buyers')
    .select('name, is_admin')
    .eq('auth_user_id', user!.id)
    .single()

  if (!buyer?.is_admin) redirect('/dashboard')

  return (
    <div className="flex min-h-screen" style={{ background: '#f8f9fc' }}>
      <div className="hidden md:block">
        <Sidebar type="admin" userName={buyer?.name || user!.email || ''} />
      </div>
      <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}
