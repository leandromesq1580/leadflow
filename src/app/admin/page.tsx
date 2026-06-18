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
  const { count: totalBuyers } = await db.from('buyers').select('*', { count: 'exact', head: true })
  const { count: activeBuyers } = await db.from('buyers').select('*', { count: 'exact', head: true }).eq('is_active', true)
  const { count: coldLeads } = await db.from('leads').select('*', { count: 'exact', head: true }).eq('type', 'cold').eq('status', 'new')
  const { data: payments } = await db.from('payments').select('amount').eq('status', 'completed')
  const totalRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0

  // Compromisso de entrega (PRECISO): por comprador com crédito de lead pago, conta
  // os leads entregues APÓS a compra. devido = max(0, pago − entregue_após). NÃO usa
  // credits.total_used — o roteamento não debita crédito, então 'used' subconta e
  // inflava o devido (o livro dizia 88; o real é ~42).
  const { data: leadCreditRows } = await db.from('credits').select('buyer_id, total_purchased, created_at').eq('type', 'lead')
  const perBuyer = new Map<string, { purchased: number; since: string | null }>()
  for (const c of leadCreditRows || []) {
    if (!c.buyer_id || !(Number(c.total_purchased) > 0)) continue
    const e = perBuyer.get(c.buyer_id) || { purchased: 0, since: null as string | null }
    e.purchased += Number(c.total_purchased)
    if (c.created_at && (!e.since || c.created_at < e.since)) e.since = c.created_at
    perBuyer.set(c.buyer_id, e)
  }
  const soldLeads = Array.from(perBuyer.values()).reduce((s, e) => s + e.purchased, 0)
  const perBuyerDelivery = await Promise.all(Array.from(perBuyer.entries()).map(async ([bid, e]) => {
    let q = db.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', bid).eq('product_type', 'lead')
    if (e.since) q = q.gte('assigned_at', e.since)
    const { count } = await q
    const delivered = Math.min(e.purchased, count || 0)
    return { delivered, owed: e.purchased - delivered }
  }))
  const deliveredPaid = perBuyerDelivery.reduce((s, x) => s + x.delivered, 0)
  const owedLeads = perBuyerDelivery.reduce((s, x) => s + x.owed, 0)
  const deliveryPct = soldLeads > 0 ? Math.round((deliveredPaid / soldLeads) * 100) : 0

  // Compradores que REALMENTE pagaram (pagamento concluído) — exclui trials/cortesias.
  const { data: paidPayments } = await db.from('payments').select('buyer_id').eq('status', 'completed')
  const payingBuyers = new Set((paidPayments || []).map((p: any) => p.buyer_id).filter(Boolean)).size

  // Gasto com tráfego pago (Meta Ads, total/all-time) — mesma fonte de /admin/ads
  // (ad account act_2374409502997954 + Marketing API insights). Resultado = receita −
  // gasto. try/catch + revalidate: uma falha do Meta não trava nem derruba o dashboard.
  let adSpend = 0
  let adSpendOk = false
  try {
    const metaToken = (process.env.META_PAGE_TOKEN || '').trim().replace(/\\n/g, '')
    if (metaToken) {
      const p = new URLSearchParams({ fields: 'spend', date_preset: 'maximum', access_token: metaToken })
      const res = await fetch(`https://graph.facebook.com/v25.0/act_2374409502997954/insights?${p.toString()}`, { next: { revalidate: 600 } })
      const raw = await res.json()
      if (!raw.error && Array.isArray(raw.data)) {
        adSpend = raw.data.reduce((s: number, r: any) => s + parseFloat(r.spend || '0'), 0)
        adSpendOk = true
      }
    }
  } catch {}
  const netResult = totalRevenue - adSpend

  const { data: recentLeads } = await db.from('leads').select('*, buyer:buyers!assigned_to(name)').order('created_at', { ascending: false }).limit(8)
  const { data: buyers } = await db.from('buyers').select('*').order('created_at', { ascending: false }).limit(5)

  return (
    <div className="max-w-[1100px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[26px] font-extrabold" style={{ color: '#1a1a2e' }}>Admin Dashboard</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>Visao geral do Lead4Producers</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/buyers" className="px-5 py-2.5 rounded-xl text-[13px] font-bold" style={{ background: '#f8f9fc', color: '#1a1a2e', border: '1px solid #e8ecf4' }}>
            👥 Compradores
          </Link>
          <Link href="/admin/buyers" className="px-5 py-2.5 rounded-xl text-[13px] font-bold" style={{ background: owedLeads > 0 ? '#fffbeb' : '#f8f9fc', color: owedLeads > 0 ? '#b45309' : '#1a1a2e', border: `1px solid ${owedLeads > 0 ? '#fde68a' : '#e8ecf4'}` }}>
            📦 {owedLeads} Leads Devidos
          </Link>
          <Link href="/admin/appointments" className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white" style={{ background: '#6366f1' }}>
            📅 {pendingAppts || 0} Appts Pendentes
          </Link>
        </div>
      </div>

      {/* Stats — linha 1: dinheiro (receita − tráfego = resultado) · linha 2: operação */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Receita" value={`$${totalRevenue.toLocaleString()}`} icon="💰" />
        <StatCard label="Gasto Tráfego (Meta)" value={adSpendOk ? `$${Math.round(adSpend).toLocaleString()}` : '—'} icon="📣" change={adSpendOk ? 'investido em anúncios' : 'Meta indisponível'} />
        <StatCard label="Resultado" value={adSpendOk ? `${netResult < 0 ? '-' : ''}$${Math.abs(Math.round(netResult)).toLocaleString()}` : '—'} icon={netResult >= 0 ? '📈' : '📉'} change={adSpendOk ? 'receita − tráfego' : 'precisa do gasto Meta'} trend={adSpendOk ? (netResult >= 0 ? 'up' : 'down') : undefined} danger={adSpendOk && netResult < 0} />
        <StatCard label="Leads Gerados" value={(totalLeads || 0).toLocaleString()} icon="📋" change={`${(assignedLeads || 0).toLocaleString()} distribuídos`} />
        <StatCard label="Vendidos (pagos)" value={soldLeads.toLocaleString()} icon="🏷️" change="leads que compradores pagaram" />
        <StatCard label="% Entrega" value={`${deliveryPct}%`} icon="🚚" change={`${deliveredPaid} de ${soldLeads} pagos entregues`} />
        <StatCard label="Compradores Pagantes" value={payingBuyers} icon="👥" change={`de ${totalBuyers} cadastrados`} />
        <StatCard label="Leads Pendentes" value={owedLeads} icon="📦" change={`devidos · ${pendingAppts || 0} appts`} accent={owedLeads > 0} />
      </div>

      {/* Cold leads alert */}
      {(coldLeads || 0) > 0 && (
        <div className="rounded-2xl p-4 mb-4 flex items-center gap-3" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <span className="text-xl">❄️</span>
          <div>
            <p className="text-[13px] font-bold" style={{ color: '#1e40af' }}>{coldLeads} leads frios disponiveis para venda</p>
            <p className="text-[12px]" style={{ color: '#3b82f6' }}>Leads com 7+ dias sem distribuir. Podem ser vendidos como pacote frio.</p>
          </div>
        </div>
      )}

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
