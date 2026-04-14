import { createServerSupabase } from '@/lib/supabase/server'
import { Sidebar } from '@/components/dashboard/sidebar'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: buyer } = await supabase
    .from('buyers')
    .select('name, is_admin')
    .eq('auth_user_id', user.id)
    .single()

  // Only admins can access /admin
  if (!buyer?.is_admin) redirect('/dashboard')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar type="admin" userName={buyer?.name || user.email || ''} />
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  )
}
