import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { StatCard } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { timeAgo, getInitials } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id, name').eq('auth_user_id', user.id).single()

  if (!buyer) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#eef2ff' }}>
            <span className="text-2xl">⏳</span>
          </div>
          <h2 className="text-lg font-bold" style={{ color: '#1a1a2e' }}>Configurando sua conta</h2>
          <p className="text-sm mt-1 mb-5" style={{ color: '#94a3b8' }}>Estamos preparando tudo. Recarregue em alguns segundos.</p>
          <a href="/dashboard" className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: '#6366f1' }}>Recarregar</a>
        </div>
      </div>
    )
  }

  let totalLeads = 0, newLeads = 0, converted = 0, remaining = 0, totalPurchased = 0
  try { const { count } = await db.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', buyer.id); totalLeads = count || 0 } catch {}
  try { const { count } = await db.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', buyer.id).eq('status', 'assigned'); newLeads = count || 0 } catch {}
  try { const { count } = await db.from('lead_activity').select('*', { count: 'exact', head: true }).eq('buyer_id', buyer.id).eq('action', 'converted'); converted = count || 0 } catch {}
  try {
    const { data: credits } = await db.from('credits').select('type, total_purchased, total_used').eq('buyer_id', buyer.id)
    const lc = credits?.filter(c => c.type === 'lead') || []
    totalPurchased = lc.reduce((s, c) => s + c.total_purchased, 0)
    remaining = totalPurchased - lc.reduce((s, c) => s + c.total_used, 0)
  } catch {}

  let recentLeads: Array<{ id: string; name: string; email: string; phone: string; city: string; state: string; status: string; interest: string; created_at: string }> = []
  try { const { data } = await db.from('leads').select('*').eq('assigned_to', buyer.id).order('created_at', { ascending: false }).limit(6); recentLeads = data || [] } catch {}

  const firstName = buyer.name?.split(' ')[0] || ''

  return (
    <div className="max-w-[1040px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight" style={{ color: '#1a1a2e' }}>
            Bom dia, {firstName} 👋
          </h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>
            Acompanhe seus leads, creditos e conversoes.
          </p>
        </div>
        <Link href="/dashboard/credits"
          className="flex items-center gap-2 px-5 py-3 rounded-xl text-[13px] font-bold text-white hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
          <span>✦</span> Comprar Creditos
        </Link>
      </div>

      {/* Credits Banner */}
      <div className="rounded-2xl p-6 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4338ca 100%)' }}>
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.3), transparent 70%)', transform: 'translate(20%, -40%)' }} />
        <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.2), transparent 70%)', transform: 'translate(-30%, 30%)' }} />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>Saldo de Creditos</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-[42px] font-extrabold text-white leading-none">{remaining}</span>
                <span className="text-[15px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>de {totalPurchased} leads</span>
              </div>
            </div>
            {totalPurchased > 0 ? (
              <div className="text-right px-4 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                <p className="text-[22px] font-extrabold text-white">{Math.round((remaining / totalPurchased) * 100)}%</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Restante</p>
              </div>
            ) : (
              <Link href="/dashboard/credits" className="px-5 py-2.5 rounded-xl text-[12px] font-bold text-white" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>
                Comprar agora →
              </Link>
            )}
          </div>
          {totalPurchased > 0 && (
            <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div className="h-2 rounded-full" style={{ background: 'linear-gradient(90deg, #818cf8, #a78bfa, #c4b5fd)', width: `${Math.max(Math.round((remaining / totalPurchased) * 100), 3)}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total de Leads" value={totalLeads} icon="👥" />
        <StatCard label="Aguardando Contato" value={newLeads} icon="📞" accent={newLeads > 0} change={newLeads > 0 ? 'Ligar agora!' : undefined} trend="up" />
        <StatCard label="Convertidos" value={converted} icon="🏆" change={totalLeads > 0 ? `${Math.round((converted / totalLeads) * 100)}% taxa` : undefined} trend="up" />
        <StatCard label="Creditos" value={remaining} icon="💳" />
      </div>

      {/* Leads Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #e8ecf4' }}>
          <div>
            <h2 className="text-[16px] font-bold" style={{ color: '#1a1a2e' }}>Leads Recentes</h2>
            <p className="text-[12px] mt-0.5" style={{ color: '#94a3b8' }}>Seus ultimos leads recebidos</p>
          </div>
          <Link href="/dashboard/leads" className="text-[13px] font-semibold flex items-center gap-1" style={{ color: '#6366f1' }}>
            Ver todos <span>→</span>
          </Link>
        </div>

        {recentLeads.length > 0 ? (
          <div>
            {recentLeads.map((lead, i) => (
              <Link
                key={lead.id}
                href={`/dashboard/leads/${lead.id}`}
                className="flex items-center gap-4 px-6 py-4 group"
                style={{ borderBottom: i < recentLeads.length - 1 ? '1px solid #f1f5f9' : 'none' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                  style={{ background: `hsl(${(lead.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
                  {getInitials(lead.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold group-hover:text-indigo-600" style={{ color: '#1a1a2e' }}>{lead.name}</p>
                  <p className="text-[12px]" style={{ color: '#94a3b8' }}>{lead.city}, {lead.state} · {lead.interest}</p>
                </div>
                <div className="hidden sm:block">
                  <span className="text-[13px] font-semibold" style={{ color: '#6366f1' }}>
                    {lead.phone}
                  </span>
                </div>
                <Badge status={lead.status} />
                <span className="text-[12px] whitespace-nowrap" style={{ color: '#94a3b8' }}>{timeAgo(lead.created_at)}</span>
                <span className="text-[18px] opacity-0 group-hover:opacity-100" style={{ color: '#94a3b8' }}>›</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 px-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: '#f1f5f9' }}>
              <span className="text-3xl">📭</span>
            </div>
            <h3 className="text-[18px] font-bold mb-1" style={{ color: '#1a1a2e' }}>Nenhum lead ainda</h3>
            <p className="text-[14px] max-w-sm mx-auto mb-6" style={{ color: '#94a3b8' }}>
              Compre creditos para comecar a receber leads exclusivos de brasileiros nos EUA interessados em seguro de vida.
            </p>
            <Link href="/dashboard/credits"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
              <span>✦</span> Comprar Creditos
            </Link>
          </div>
        )}
      </div>

      {/* Quick Tips */}
      {totalLeads === 0 && (
        <div className="grid grid-cols-3 gap-4 mt-6">
          {[
            { step: '01', icon: '💳', title: 'Compre creditos', desc: 'Escolha um pacote de leads ou appointments no menu Creditos' },
            { step: '02', icon: '⚡', title: 'Receba leads', desc: 'Leads chegam em tempo real no seu painel e por email/SMS' },
            { step: '03', icon: '🏆', title: 'Feche vendas', desc: 'Ligue nos primeiros 5 minutos — 3x mais chance de conversao' },
          ].map((tip) => (
            <div key={tip.step} className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{tip.icon}</span>
                <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Passo {tip.step}</span>
              </div>
              <h3 className="text-[14px] font-bold mb-1" style={{ color: '#1a1a2e' }}>{tip.title}</h3>
              <p className="text-[12px] leading-relaxed" style={{ color: '#64748b' }}>{tip.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
