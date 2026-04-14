import { createServerSupabase } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { timeAgo } from '@/lib/utils'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: buyer } = await supabase
    .from('buyers')
    .select('id')
    .eq('auth_user_id', user!.id)
    .single()

  const buyerId = buyer?.id

  // Stats
  const { count: totalLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_to', buyerId!)

  const { count: newLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_to', buyerId!)
    .eq('status', 'assigned')

  const { count: converted } = await supabase
    .from('lead_activity')
    .select('*', { count: 'exact', head: true })
    .eq('buyer_id', buyerId!)
    .eq('action', 'converted')

  // Credits
  const { data: credits } = await supabase
    .from('credits')
    .select('type, total_purchased, total_used')
    .eq('buyer_id', buyerId!)

  const leadCredits = credits?.filter(c => c.type === 'lead') || []
  const totalPurchased = leadCredits.reduce((sum, c) => sum + c.total_purchased, 0)
  const totalUsed = leadCredits.reduce((sum, c) => sum + c.total_used, 0)
  const remaining = totalPurchased - totalUsed

  // Recent leads
  const { data: recentLeads } = await supabase
    .from('leads')
    .select('*')
    .eq('assigned_to', buyerId!)
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Visao Geral</h1>
          <p className="text-sm text-gray-500">Acompanhe seus leads e resultados</p>
        </div>
        <Link
          href="/dashboard/credits"
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
        >
          Comprar Creditos
        </Link>
      </div>

      {/* Credits Bar */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-6">
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="text-sm text-gray-500">Creditos Restantes</p>
            <p className="text-2xl font-extrabold">
              {remaining} <span className="text-sm text-gray-400 font-medium">de {totalPurchased} leads</span>
            </p>
          </div>
          {totalPurchased > 0 && (
            <p className="text-sm text-blue-600 font-semibold">
              {Math.round((remaining / totalPurchased) * 100)}% restante
            </p>
          )}
        </div>
        {totalPurchased > 0 && (
          <div className="bg-gray-100 rounded-full h-2.5">
            <div
              className="bg-gradient-to-r from-blue-600 to-purple-600 h-2.5 rounded-full transition-all"
              style={{ width: `${Math.round((remaining / totalPurchased) * 100)}%` }}
            />
          </div>
        )}
        {totalPurchased === 0 && (
          <p className="text-sm text-gray-400 mt-2">
            Voce ainda nao tem creditos.{' '}
            <Link href="/dashboard/credits" className="text-blue-600 font-semibold hover:underline">
              Comprar agora
            </Link>
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total de Leads" value={totalLeads || 0} />
        <StatCard label="Novos (nao contatados)" value={newLeads || 0} change={newLeads ? 'Ligar agora!' : ''} trend="up" />
        <StatCard label="Convertidos" value={converted || 0} />
        <StatCard label="Creditos Restantes" value={remaining} />
      </div>

      {/* Recent Leads */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex justify-between items-center">
          <h2 className="font-bold text-gray-900">Leads Recentes</h2>
          <Link href="/dashboard/leads" className="text-sm text-blue-600 font-semibold hover:underline">
            Ver todos
          </Link>
        </div>
        {recentLeads && recentLeads.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Lead</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Telefone</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Cidade</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Recebido</th>
              </tr>
            </thead>
            <tbody>
              {recentLeads.map((lead) => (
                <tr key={lead.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/dashboard/leads/${lead.id}`} className="font-semibold text-sm text-gray-900 hover:text-blue-600">
                      {lead.name}
                    </Link>
                    <p className="text-xs text-gray-400">{lead.email}</p>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{lead.phone}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{lead.city}, {lead.state}</td>
                  <td className="px-5 py-3"><Badge status={lead.status} /></td>
                  <td className="px-5 py-3 text-xs text-gray-400">{timeAgo(lead.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-gray-500 font-medium">Nenhum lead ainda</p>
            <p className="text-sm text-gray-400 mt-1">Compre creditos para comecar a receber leads exclusivos</p>
          </div>
        )}
      </div>
    </div>
  )
}
