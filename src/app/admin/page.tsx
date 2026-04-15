import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { timeAgo, getInitials } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const { count: totalLeads } = await db.from('leads').select('*', { count: 'exact', head: true })
  const { count: assignedLeads } = await db.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'assigned')
  const { count: unassignedLeads } = await db.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'new')
  const { count: pendingAppts } = await db.from('leads').select('*', { count: 'exact', head: true }).eq('product_type', 'appointment').eq('status', 'new')
  const { count: totalBuyers } = await db.from('buyers').select('*', { count: 'exact', head: true })  const { count: activeBuyers } = await db.from('buyers').select('*', { count: 'exact', head: true }).eq('is_active', true)
  const { data: payments } = await db.from('payments').select('amount').eq('status', 'completed')
  const totalRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

  const { data: recentLeads } = await db.from('leads').select('*, buyer:buyers!assigned_to(name)').order('created_at', { ascending: false }).limit(8)
  const { data: buyers } = await db.from('buyers').select('*').eq('is_admin', false).order('created_at', { ascending: false }).limit(5)

  return (
    <div className="max-w-[1100px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[26px] font-extrabold" style={{ color: '#1a1a2e' }}>Admin Dashboard</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>Visao geral do LeadFlow</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/buyers" className="px-5 py-2.5 rounded-xl text-[13px] font-bold" style={{ background: '#f8f9fc', color: '#1a1a2e', border: '1px solid #e8ecf4' }}>
            👥 Compradores
          </Link>
          <Link href="/admin/appointments" className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white" style={{ background: '#6366f1' }}>
            📅 {pendingAppts || 0} Appointments Pendentes
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <StatCard label="Receita" value={`$${totalRevenue.toLocaleString()}`} icon="💰" />
        <StatCard label="Leads Gerados" value={totalLeads || 0} icon="📋" />
        <StatCard label="Vendidos" value={assignedLeads || 0} icon="✅" change={`${unassignedLeads || 0} na fila`} />
        <StatCard label="Compradores" value={`${activeBuyers}/${totalBuyers}`} icon="👥" />
        <StatCard label="Appts Pendentes" value={pendingAppts || 0} icon="📅" accent={(pendingAppts || 0) > 0} />
      </div>

      {/* Alerts */}
      {(unassignedLeads || 0) > 0 && (
        <div className="rounded-2xl p-4 mb-6 flex items-center gap-3" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-[13px] font-bold" style={{ color: '#92400e' }}>{unassignedLeads} lead{(unassignedLeads || 0) > 1 ? 's' : ''} sem comprador</p>
            <p className="text-[12px]" style={{ color: '#b45309' }}>Nenhum comprador elegivel (sem credito ou sem licenca no estado)</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Recent Leads */}
        <div className="col-span-2 rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <div className="px-6 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid #e8ecf4' }}>
            <h2 className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>Leads Recentes</h2>
            <Link href="/admin/leads" className="text-[13px] font-semibold" style={{ color: '#6366f1' }}>Ver todos →</Link>
          </div>
          {recentLeads && recentLeads.length > 0 ? (
            <div>
              {recentLeads.map((lead: any, i: number) => (
                <div key={lead.id} className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: i < recentLeads.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white" style={{ background: `hsl(${(lead.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
                    {getInitials(lead.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: '#1a1a2e' }}>{lead.name}</p>
                    <p className="text-[11px]" style={{ color: '#94a3b8' }}>{lead.city}, {lead.state}</p>
                  </div>
                  <span className="text-[12px] font-medium" style={{ color: '#64748b' }}>
                    {lead.buyer?.name || <span style={{ color: '#f59e0b' }}>Na fila</span>}
                  </span>
                  <Badge status={lead.status} />
                  <span className="text-[11px]" style={{ color: '#94a3b8' }}>{timeAgo(lead.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-[13px]" style={{ color: '#94a3b8' }}>Nenhum lead</div>
          )}
        </div>

        {/* Buyers */}
        <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <div className="px-5 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid #e8ecf4' }}>
            <h2 className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>Compradores</h2>
            <Link href="/admin/buyers" className="text-[13px] font-semibold" style={{ color: '#6366f1' }}>Ver todos →</Link>
          </div>
          {buyers && buyers.length > 0 ? (
            <div>
              {buyers.map((b: any) => (
                <Link key={b.id} href={`/admin/buyers/${b.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50" style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{b.name}</p>
                    <p className="text-[11px]" style={{ color: '#94a3b8' }}>{b.email}</p>
                  </div>
                  <Badge status={b.is_active ? 'active' : 'pending'} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-[13px]" style={{ color: '#94a3b8' }}>Nenhum comprador</div>
          )}
        </div>
      </div>
    </div>
  )
}
