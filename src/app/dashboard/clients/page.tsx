import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { ClientsInbox } from '@/components/dashboard/clients-inbox'

export const dynamic = 'force-dynamic'

/**
 * Atendimento a Clientes DENTRO do dashboard (perfil do usuário admin, ex:
 * Regiane). Mesmo inbox do /admin/clients, mas na navegação do dashboard.
 * Só admins — comprador comum é redirecionado.
 */
export default async function DashboardClientsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) redirect('/dashboard')

  let migrated = true
  const probe = await db.from('client_messages').select('id', { head: true, count: 'exact' }).limit(1)
  if (probe.error) migrated = false

  return (
    <div className="max-w-[1100px]">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>👥 Atendimento a Clientes</h1>
      <p className="text-[14px] mb-6" style={{ color: '#64748b' }}>
        Conversas com os compradores — separadas dos seus leads. Mesmo número, caixa própria.
      </p>
      {!migrated ? (
        <div className="rounded-xl px-5 py-4" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p className="text-[13px] font-bold" style={{ color: '#dc2626' }}>Migração pendente — rode 019_client_messages.sql.</p>
        </div>
      ) : <ClientsInbox />}
    </div>
  )
}
