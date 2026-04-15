import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { StatCard } from '@/components/ui/stat-card'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function RevenuePage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: payments } = await db.from('payments').select('*, buyer:buyers(name, email)').order('created_at', { ascending: false })

  const completed = payments?.filter(p => p.status === 'completed') || []
  const totalRevenue = completed.reduce((s, p) => s + Number(p.amount), 0)
  const totalLeadsSold = completed.filter(p => p.product_type === 'lead').reduce((s, p) => s + p.quantity, 0)
  const totalApptsSold = completed.filter(p => p.product_type === 'appointment').reduce((s, p) => s + p.quantity, 0)

  return (
    <div className="max-w-[1100px]">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>Receita</h1>
      <p className="text-[14px] mb-8" style={{ color: '#64748b' }}>Acompanhe seus ganhos</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Receita Total" value={`$${totalRevenue.toLocaleString()}`} icon="💰" />
        <StatCard label="Leads Vendidos" value={totalLeadsSold} icon="📋" />
        <StatCard label="Appts Vendidos" value={totalApptsSold} icon="📅" />
        <StatCard label="Pagamentos" value={completed.length} icon="💳" />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <div className="px-6 py-4" style={{ borderBottom: '1px solid #e8ecf4' }}>
          <h2 className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>Historico de Pagamentos</h2>
        </div>
        {completed.length > 0 ? (
          <div>
            {completed.map((p: any, i: number) => (
              <div key={p.id} className="flex items-center gap-4 px-6 py-3" style={{ borderBottom: i < completed.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <div className="flex-1">
                  <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{p.buyer?.name}</p>
                  <p className="text-[11px]" style={{ color: '#94a3b8' }}>{p.buyer?.email}</p>
                </div>
                <span className="text-[12px] font-medium" style={{ color: '#64748b' }}>{p.quantity}x {p.product_type === 'lead' ? 'Lead' : 'Appt'}</span>
                <span className="text-[14px] font-bold" style={{ color: '#10b981' }}>${Number(p.amount).toFixed(0)}</span>
                <span className="text-[11px]" style={{ color: '#94a3b8' }}>{new Date(p.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-[13px]" style={{ color: '#94a3b8' }}>Nenhum pagamento</div>
        )}
      </div>
    </div>
  )
}
