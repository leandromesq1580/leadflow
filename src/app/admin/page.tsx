import { createServerSupabase } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export default async function AdminDashboard() {
  const supabase = await createServerSupabase()

  // Stats
  const { count: totalLeads } = await supabase
    .from('leads').select('*', { count: 'exact', head: true })

  const { count: assignedLeads } = await supabase
    .from('leads').select('*', { count: 'exact', head: true }).eq('status', 'assigned')

  const { count: unassignedLeads } = await supabase
    .from('leads').select('*', { count: 'exact', head: true }).eq('status', 'new')

  const { count: totalBuyers } = await supabase
    .from('buyers').select('*', { count: 'exact', head: true }).eq('is_admin', false)

  const { count: activeBuyers } = await supabase
    .from('buyers').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('is_admin', false)

  // Revenue
  const { data: payments } = await supabase
    .from('payments')
    .select('amount')
    .eq('status', 'completed')

  const totalRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

  // Recent leads
  const { data: recentLeads } = await supabase
    .from('leads')
    .select('*, buyer:buyers!assigned_to(name)')
    .order('created_at', { ascending: false })
    .limit(8)

  // Recent buyers
  const { data: buyers } = await supabase
    .from('buyers')
    .select('*')
    .eq('is_admin', false)
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500">Visao geral do LeadFlow</p>
        </div>
        <Link href="/admin/buyers" className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700">
          + Novo Comprador
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Receita Total" value={`$${totalRevenue.toLocaleString()}`} change="Todos os pagamentos" />
        <StatCard label="Leads Gerados" value={totalLeads || 0} />
        <StatCard label="Leads Vendidos" value={assignedLeads || 0} change={`${unassignedLeads || 0} nao vendidos`} />
        <StatCard label="Compradores" value={`${activeBuyers || 0} ativos`} change={`${totalBuyers || 0} total`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Leads */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex justify-between items-center">
            <h2 className="font-bold text-gray-900">Leads Recentes</h2>
            <Link href="/admin/leads" className="text-sm text-blue-600 font-semibold hover:underline">Ver todos</Link>
          </div>
          {recentLeads && recentLeads.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase">Lead</th>
                  <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase">Cidade</th>
                  <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase">Vendido para</th>
                  <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map(lead => (
                  <tr key={lead.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-2.5 text-sm font-semibold">{lead.name}</td>
                    <td className="px-5 py-2.5 text-sm text-gray-500">{lead.city}, {lead.state}</td>
                    <td className="px-5 py-2.5 text-sm">
                      {lead.buyer?.name || <span className="text-orange-500 font-semibold">Disponivel</span>}
                    </td>
                    <td className="px-5 py-2.5"><Badge status={lead.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12 text-gray-400 text-sm">Nenhum lead ainda</div>
          )}
        </div>

        {/* Buyers */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex justify-between items-center">
            <h2 className="font-bold text-gray-900">Compradores</h2>
            <Link href="/admin/buyers" className="text-sm text-blue-600 font-semibold hover:underline">Ver todos</Link>
          </div>
          {buyers && buyers.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {buyers.map(b => (
                <div key={b.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{b.name}</p>
                    <p className="text-xs text-gray-400">{b.email}</p>
                  </div>
                  <Badge status={b.is_active ? 'active' : 'pending'} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm">Nenhum comprador</div>
          )}
        </div>
      </div>
    </div>
  )
}
