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
          <p className="text-[14px]" style={{ color: '#666' }}>Configurando sua conta...</p>
          <a href="/dashboard" className="inline-block mt-4 px-4 py-2 rounded-md text-[13px] font-medium text-white" style={{ background: '#111' }}>Recarregar</a>
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
  try { const { data } = await db.from('leads').select('*').eq('assigned_to', buyer.id).order('created_at', { ascending: false }).limit(5); recentLeads = data || [] } catch {}

  const firstName = buyer.name?.split(' ')[0] || ''

  return (
    <div className="max-w-[960px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[24px] font-bold" style={{ color: '#111' }}>Ola, {firstName}</h1>
          <p className="text-[14px] mt-1" style={{ color: '#666' }}>Resumo dos seus leads e creditos</p>
        </div>
        <Link href="/dashboard/credits"
          className="px-4 py-2.5 rounded-md text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: '#111' }}>
          Comprar Creditos
        </Link>
      </div>

      {/* Credits */}
      <div className="bg-white rounded-lg border p-5 mb-6" style={{ borderColor: '#eaeaea' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Creditos</p>
            <p className="text-[28px] font-bold mt-0.5" style={{ color: '#111' }}>
              {remaining} <span className="text-[14px] font-normal" style={{ color: '#999' }}>/ {totalPurchased}</span>
            </p>
          </div>
          {totalPurchased > 0 && (
            <p className="text-[13px] font-semibold" style={{ color: '#0070f3' }}>
              {Math.round((remaining / totalPurchased) * 100)}% restante
            </p>
          )}
        </div>
        {totalPurchased > 0 ? (
          <div className="mt-3 h-1.5 rounded-full" style={{ background: '#eaeaea' }}>
            <div className="h-1.5 rounded-full transition-all" style={{ background: '#0070f3', width: `${Math.max(Math.round((remaining / totalPurchased) * 100), 2)}%` }} />
          </div>
        ) : (
          <p className="text-[13px] mt-2" style={{ color: '#999' }}>
            Sem creditos. <Link href="/dashboard/credits" className="font-semibold hover:underline" style={{ color: '#0070f3' }}>Comprar agora</Link>
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total de Leads" value={totalLeads} />
        <StatCard label="Aguardando Contato" value={newLeads} change={newLeads > 0 ? 'Ligue agora' : undefined} trend="up" />
        <StatCard label="Convertidos" value={converted} />
        <StatCard label="Creditos" value={remaining} />
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: '#eaeaea' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#eaeaea' }}>
          <h2 className="text-[14px] font-semibold" style={{ color: '#111' }}>Leads Recentes</h2>
          <Link href="/dashboard/leads" className="text-[13px] font-medium" style={{ color: '#0070f3' }}>Ver todos</Link>
        </div>

        {recentLeads.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid #eaeaea' }}>
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Nome</th>
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Telefone</th>
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Local</th>
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Status</th>
                <th className="text-left px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Quando</th>
              </tr>
            </thead>
            <tbody>
              {recentLeads.map((lead) => (
                <tr key={lead.id} className="transition-colors hover:bg-[#fafafa]" style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td className="px-5 py-3">
                    <Link href={`/dashboard/leads/${lead.id}`} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: '#111' }}>
                        {getInitials(lead.name)}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold" style={{ color: '#111' }}>{lead.name}</p>
                        <p className="text-[11px]" style={{ color: '#999' }}>{lead.interest}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <a href={`tel:${lead.phone}`} className="text-[13px] font-medium" style={{ color: '#0070f3' }}>{lead.phone}</a>
                  </td>
                  <td className="px-5 py-3 text-[13px]" style={{ color: '#666' }}>{lead.city}, {lead.state}</td>
                  <td className="px-5 py-3"><Badge status={lead.status} /></td>
                  <td className="px-5 py-3 text-[12px]" style={{ color: '#999' }}>{timeAgo(lead.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-16 px-6">
            <p className="text-[15px] font-semibold" style={{ color: '#111' }}>Nenhum lead ainda</p>
            <p className="text-[13px] mt-1 max-w-xs mx-auto" style={{ color: '#999' }}>
              Compre creditos para comecar a receber leads exclusivos de brasileiros nos EUA.
            </p>
            <Link href="/dashboard/credits"
              className="inline-block mt-5 px-4 py-2.5 rounded-md text-[13px] font-medium text-white"
              style={{ background: '#111' }}>
              Comprar Creditos
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
