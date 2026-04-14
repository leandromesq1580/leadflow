import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { timeAgo } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const adminDb = createAdminClient()
  const { data: buyer } = await adminDb
    .from('buyers')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .single()

  if (!buyer) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⏳</span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">Configurando sua conta...</h2>
          <p className="text-slate-500 text-sm mb-6">Estamos preparando tudo para voce. Recarregue a pagina em alguns segundos.</p>
          <a href="/dashboard" className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
            Recarregar
          </a>
        </div>
      </div>
    )
  }

  const buyerId = buyer.id
  let totalLeads = 0, newLeads = 0, converted = 0
  let remaining = 0, totalPurchased = 0

  try {
    const { count } = await adminDb.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', buyerId)
    totalLeads = count || 0
  } catch {}

  try {
    const { count } = await adminDb.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', buyerId).eq('status', 'assigned')
    newLeads = count || 0
  } catch {}

  try {
    const { count } = await adminDb.from('lead_activity').select('*', { count: 'exact', head: true }).eq('buyer_id', buyerId).eq('action', 'converted')
    converted = count || 0
  } catch {}

  try {
    const { data: credits } = await adminDb.from('credits').select('type, total_purchased, total_used').eq('buyer_id', buyerId)
    const leadCredits = credits?.filter(c => c.type === 'lead') || []
    totalPurchased = leadCredits.reduce((sum, c) => sum + c.total_purchased, 0)
    const totalUsed = leadCredits.reduce((sum, c) => sum + c.total_used, 0)
    remaining = totalPurchased - totalUsed
  } catch {}

  let recentLeads: Array<{
    id: string; name: string; email: string; phone: string;
    city: string; state: string; status: string; type: string; interest: string; created_at: string
  }> = []

  try {
    const { data } = await adminDb.from('leads').select('*').eq('assigned_to', buyerId).order('created_at', { ascending: false }).limit(5)
    recentLeads = data || []
  } catch {}

  const firstName = buyer.name?.split(' ')[0] || 'Voce'

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Ola, {firstName} 👋
          </h1>
          <p className="text-slate-500 mt-1">Aqui esta o resumo dos seus leads</p>
        </div>
        <Link
          href="/dashboard/credits"
          className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl text-sm font-bold hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-600/20 hover:-translate-y-0.5"
        >
          + Comprar Creditos
        </Link>
      </div>

      {/* Credits Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 rounded-2xl p-6 mb-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-blue-300 text-sm font-semibold uppercase tracking-wider">Saldo de Creditos</p>
              <p className="text-4xl font-extrabold mt-1">
                {remaining}
                <span className="text-lg text-white/40 font-medium ml-2">/ {totalPurchased} leads</span>
              </p>
            </div>
            {totalPurchased > 0 && (
              <div className="bg-white/10 backdrop-blur px-4 py-2 rounded-xl">
                <p className="text-sm font-bold">{Math.round((remaining / totalPurchased) * 100)}%</p>
                <p className="text-[10px] text-white/50 uppercase">Restante</p>
              </div>
            )}
          </div>
          {totalPurchased > 0 ? (
            <div className="bg-white/10 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-400 to-emerald-400 h-2 rounded-full transition-all"
                style={{ width: `${Math.max(Math.round((remaining / totalPurchased) * 100), 2)}%` }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 mt-2">
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              <p className="text-sm text-white/60">
                Voce ainda nao tem creditos.{' '}
                <Link href="/dashboard/credits" className="text-blue-400 font-bold hover:underline">
                  Comprar agora →
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total de Leads"
          value={totalLeads}
          icon="👥"
          change={totalLeads > 0 ? `${totalLeads} recebidos` : undefined}
        />
        <StatCard
          label="Aguardando Contato"
          value={newLeads}
          icon="📞"
          change={newLeads > 0 ? 'Ligar agora!' : undefined}
          trend="up"
          gradient={newLeads > 0 ? 'bg-gradient-to-br from-amber-500 to-orange-600 border-orange-600' : undefined}
        />
        <StatCard
          label="Convertidos"
          value={converted}
          icon="✅"
          change={totalLeads > 0 ? `${totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0}% taxa` : undefined}
          trend="up"
        />
        <StatCard
          label="Creditos Restantes"
          value={remaining}
          icon="💳"
        />
      </div>

      {/* Recent Leads Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Leads Recentes</h2>
            <p className="text-xs text-slate-400 mt-0.5">Ultimos leads recebidos</p>
          </div>
          <Link href="/dashboard/leads" className="text-sm text-blue-600 font-bold hover:underline">
            Ver todos →
          </Link>
        </div>
        {recentLeads.length > 0 ? (
          <div className="divide-y divide-slate-50">
            {recentLeads.map((lead) => (
              <Link
                key={lead.id}
                href={`/dashboard/leads/${lead.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors group"
              >
                <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-md flex-shrink-0">
                  {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">{lead.name}</p>
                  <p className="text-xs text-slate-400 truncate">{lead.city}, {lead.state} — {lead.interest}</p>
                </div>
                <div className="hidden sm:block text-right">
                  <a href={`tel:${lead.phone}`} onClick={(e) => e.stopPropagation()} className="text-sm text-blue-600 font-semibold hover:underline">
                    {lead.phone}
                  </a>
                </div>
                <Badge status={lead.status} />
                <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(lead.created_at)}</span>
                <span className="text-slate-300 group-hover:text-blue-400 transition-colors">→</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📭</span>
            </div>
            <p className="text-slate-900 font-bold text-lg mb-1">Nenhum lead ainda</p>
            <p className="text-sm text-slate-400 max-w-sm mx-auto">
              Compre creditos para comecar a receber leads exclusivos de brasileiros interessados em seguro de vida.
            </p>
            <Link
              href="/dashboard/credits"
              className="inline-block mt-6 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors"
            >
              Comprar Creditos
            </Link>
          </div>
        )}
      </div>

      {/* Quick Tips (when no leads) */}
      {totalLeads === 0 && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: '1️⃣', title: 'Compre creditos', desc: 'Escolha um pacote de leads ou appointments' },
            { icon: '2️⃣', title: 'Receba leads', desc: 'Leads chegam em tempo real no seu painel e email' },
            { icon: '3️⃣', title: 'Feche vendas', desc: 'Ligue nos primeiros 5 min para 3x mais conversao' },
          ].map((tip, i) => (
            <div key={i} className="bg-white rounded-xl p-5 border border-slate-200 border-dashed">
              <span className="text-2xl">{tip.icon}</span>
              <h3 className="font-bold text-slate-900 text-sm mt-2">{tip.title}</h3>
              <p className="text-xs text-slate-400 mt-1">{tip.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
