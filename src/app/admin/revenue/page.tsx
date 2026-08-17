import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { BackfillCrmButton } from '@/components/admin/backfill-crm-button'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const CRM_PRICE = 99

export default async function RevenuePage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const [paymentsRes, buyersRes] = await Promise.all([
    db.from('payments').select('*, buyer:buyers(name, email)').order('created_at', { ascending: false }),
    db.from('buyers').select('id, name, email, crm_plan, crm_subscription_status, crm_subscription_id, created_at'),
  ])

  const payments = paymentsRes.data || []
  const buyers = buyersRes.data || []

  const completed = payments.filter(p => p.status === 'completed')
  const totalRevenue = completed.reduce((s, p) => s + Number(p.amount), 0)

  // MRR: SO assinaturas pagas reais. O webhook do Stripe grava crm_subscription_id
  // quando ha assinatura paga; contas Pro de cortesia (setadas na mao) tem id null
  // → entram como "cortesia" e NAO contam no MRR.
  const activePro = buyers.filter(b => b.crm_plan === 'pro' && b.crm_subscription_status === 'active')
  const payingProSubs = activePro.filter(b => !!b.crm_subscription_id).length
  const compProSubs = activePro.filter(b => !b.crm_subscription_id).length

  // Receita deste mes em todos os provedores registrados em payments.
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const thisMonthRevenue = completed.filter(p => p.created_at >= monthStart).reduce((s, p) => s + Number(p.amount), 0)

  // Receita real dos ultimos 30 dias: payments inclui pacotes e CRM.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const last30dRevenue = completed
    .filter(p => p.created_at >= thirtyDaysAgo)
    .reduce((s, p) => s + Number(p.amount), 0)

  // Top customers por pagamento real; inclui pacotes, leads frios e CRM sem duplicar credits.
  const revenueByBuyer: Record<string, number> = {}
  for (const payment of completed) {
    revenueByBuyer[payment.buyer_id] = (revenueByBuyer[payment.buyer_id] || 0) + Number(payment.amount)
  }
  const topCustomers = Object.entries(revenueByBuyer)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([buyerId, total]) => ({ buyer: buyers.find(b => b.id === buyerId), total }))
    .filter(x => x.buyer)

  // Assinantes CRM Pro: pagantes (assinatura Stripe ativa) vs cortesia (Pro setado na mao)
  const proBuyers = buyers.filter(b => b.crm_plan === 'pro')
  const crmPayers = proBuyers.filter(b => !!b.crm_subscription_id && b.crm_subscription_status === 'active')
  const crmCourtesy = proBuyers.filter(b => !(!!b.crm_subscription_id && b.crm_subscription_status === 'active'))

  // Datas reais de cobrança dos pagantes — buscadas no Stripe (o crm_expires_at do banco
  // está vazio). current_period_start = último pagamento; current_period_end = próxima.
  const subDates: Record<string, { paid: number | null; renews: number | null; valor: number; label: string; mensal: number }> = {}
  try {
    const stripe = getStripe()
    const rows = await Promise.all(crmPayers.map(async (b: any) => {
      try {
        const s: any = await stripe.subscriptions.retrieve(b.crm_subscription_id)
        const it = s.items?.data?.[0] || {}
        const price = it.price || {}
        const valor = price.unit_amount != null ? price.unit_amount / 100 : CRM_PRICE
        const ic = price.recurring?.interval_count || 1
        const meses = price.recurring?.interval === 'year' ? 12 * ic : ic
        const label = meses === 12 ? 'Anual' : meses === 6 ? 'Semestral' : meses === 3 ? 'Trimestral' : 'Mensal'
        return { id: b.id, paid: s.current_period_start ?? it.current_period_start ?? null, renews: s.current_period_end ?? it.current_period_end ?? null, valor, label, mensal: valor / meses }
      } catch { return { id: b.id, paid: null, renews: null, valor: CRM_PRICE, label: 'Mensal', mensal: CRM_PRICE } }
    }))
    for (const r of rows) subDates[r.id] = { paid: r.paid, renews: r.renews, valor: r.valor, label: r.label, mensal: r.mensal }
  } catch {}
  // MRR = soma do equivalente MENSAL de cada pagante (trimestral $237 = ~$79/mes; anual $718.80 = ~$59.90/mes).
  const mrr = Math.round(crmPayers.reduce((acc: number, b: any) => acc + (subDates[b.id]?.mensal ?? CRM_PRICE), 0))
  const fmtTs = (ts: number | null) => ts ? new Date(ts * 1000).toLocaleDateString('pt-BR') : null
  // Sempre do mais recente pro mais antigo: pagantes pelo ultimo pagamento, cortesias pela criacao
  crmPayers.sort((a: any, b: any) => (subDates[b.id]?.paid ?? 0) - (subDates[a.id]?.paid ?? 0) || new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  crmCourtesy.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())

  // Monthly data for last 6 months
  const months: { month: string; revenue: number; label: string }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const mStart = d.toISOString()
    const mEnd = nextMonth.toISOString()
    const mRev = completed.filter(p => p.created_at >= mStart && p.created_at < mEnd).reduce((s, p) => s + Number(p.amount), 0)
    months.push({ month: d.toISOString().slice(0, 7), revenue: mRev, label: d.toLocaleDateString('pt-BR', { month: 'short' }) })
  }
  const maxMonthRev = Math.max(...months.map(m => m.revenue), 1)

  const totalLeadsSold = completed.filter(p => p.product_type === 'lead' || p.product_type === 'cold_lead').reduce((s, p) => s + Number(p.quantity || 0), 0)
  const totalApptsSold = completed.filter(p => p.product_type === 'appointment').reduce((s, p) => s + Number(p.quantity || 0), 0)

  return (
    <div className="max-w-[1100px]">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>Receita</h1>
      <p className="text-[14px] mb-4" style={{ color: '#64748b' }}>Financeiro do Lead4Producers</p>
      <div className="mb-8"><BackfillCrmButton /></div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.7)' }}>MRR (CRM Pro)</p>
          <p className="text-[28px] font-extrabold mt-1 text-white">${mrr.toLocaleString()}</p>
          <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{payingProSubs} pagante{payingProSubs === 1 ? '' : 's'} (equiv. mensal){compProSubs > 0 ? ` · ${compProSubs} cortesia` : ''}</p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Receita este mês</p>
          <p className="text-[28px] font-extrabold mt-1" style={{ color: '#10b981' }}>${thisMonthRevenue.toLocaleString()}</p>
          <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>Pagamentos confirmados</p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Últimos 30 dias</p>
          <p className="text-[28px] font-extrabold mt-1" style={{ color: '#1a1a2e' }}>${last30dRevenue.toLocaleString()}</p>
          <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>Inclui CRM Pro</p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Total histórico</p>
          <p className="text-[28px] font-extrabold mt-1" style={{ color: '#1a1a2e' }}>${totalRevenue.toLocaleString()}</p>
          <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>{totalLeadsSold} leads · {totalApptsSold} appts</p>
        </div>
      </div>

      {/* Monthly chart */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[14px] font-bold mb-4" style={{ color: '#1a1a2e' }}>Últimos 6 meses</h2>
        <div className="flex items-end gap-3 h-[160px]">
          {months.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex flex-col items-center justify-end flex-1">
                <span className="text-[10px] font-bold mb-1" style={{ color: '#64748b' }}>
                  ${m.revenue > 0 ? m.revenue.toLocaleString() : '—'}
                </span>
                <div className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${(m.revenue / maxMonthRev) * 100}%`,
                    minHeight: m.revenue > 0 ? '4px' : '0',
                    background: 'linear-gradient(180deg, #6366f1, #8b5cf6)',
                  }} />
              </div>
              <span className="text-[11px] font-semibold uppercase" style={{ color: '#94a3b8' }}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top customers */}
      <div className="rounded-2xl overflow-hidden mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <div className="px-6 py-4" style={{ borderBottom: '1px solid #e8ecf4' }}>
          <h2 className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>🏆 Top 5 clientes</h2>
        </div>
        {topCustomers.length > 0 ? (
          <div>
            {topCustomers.map((c, i) => (
              <Link key={c.buyer!.id} href={`/admin/buyers/${c.buyer!.id}`}
                className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50"
                style={{ borderBottom: i < topCustomers.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-bold"
                  style={{ background: i === 0 ? '#fef3c7' : '#f1f5f9', color: i === 0 ? '#92400e' : '#64748b' }}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-bold" style={{ color: '#1a1a2e' }}>{c.buyer!.name}</p>
                    {c.buyer!.crm_plan === 'pro' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: 'linear-gradient(135deg, #a78bfa, #6366f1)', color: '#fff' }}>Pro</span>}
                  </div>
                  <p className="text-[11px]" style={{ color: '#94a3b8' }}>{c.buyer!.email}</p>
                </div>
                <p className="text-[16px] font-extrabold" style={{ color: '#10b981' }}>${c.total.toFixed(0)}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-center py-8 text-[13px]" style={{ color: '#94a3b8' }}>Nenhum cliente ainda</p>
        )}
      </div>

      {/* Assinantes CRM Pro — quem paga */}
      <div className="rounded-2xl overflow-hidden mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <div className="px-6 py-4" style={{ borderBottom: '1px solid #e8ecf4' }}>
          <h2 className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>💳 Assinantes CRM Pro — quem paga ({crmPayers.length} pagante{crmPayers.length === 1 ? '' : 's'} · {crmCourtesy.length} cortesia)</h2>
        </div>
        {crmPayers.length === 0 && crmCourtesy.length === 0 ? (
          <p className="text-center py-8 text-[13px]" style={{ color: '#94a3b8' }}>Nenhum assinante Pro</p>
        ) : (
          <div>
            {crmPayers.map((b: any) => (
              <Link key={b.id} href={`/admin/buyers/${b.id}`} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50" style={{ borderBottom: '1px solid #f1f5f9' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold truncate" style={{ color: '#1a1a2e' }}>{b.name}</p>
                  <p className="text-[11px] truncate" style={{ color: '#94a3b8' }}>{b.email}</p>
                </div>
                <div className="text-right hidden sm:block flex-shrink-0">
                  <p className="text-[11px] font-semibold" style={{ color: '#64748b' }}>{fmtTs(subDates[b.id]?.paid ?? null) ? `pgto ${fmtTs(subDates[b.id]?.paid ?? null)}` : '—'}</p>
                  <p className="text-[10px]" style={{ color: '#94a3b8' }}>{fmtTs(subDates[b.id]?.renews ?? null) ? `renova ${fmtTs(subDates[b.id]?.renews ?? null)}` : ''}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase flex-shrink-0" style={{ background: '#dcfce7', color: '#15803d' }}>{subDates[b.id]?.label || 'Mensal'} · ${subDates[b.id]?.valor ?? 99}</span>
              </Link>
            ))}
            {crmCourtesy.map((b: any, i: number) => (
              <Link key={b.id} href={`/admin/buyers/${b.id}`} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50" style={{ borderBottom: i < crmCourtesy.length - 1 ? '1px solid #f1f5f9' : 'none', opacity: 0.7 }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: '#64748b' }}>{b.name}</p>
                  <p className="text-[11px] truncate" style={{ color: '#94a3b8' }}>{b.email}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase flex-shrink-0" style={{ background: '#f1f5f9', color: '#94a3b8' }}>Cortesia</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Payments history */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <div className="px-6 py-4" style={{ borderBottom: '1px solid #e8ecf4' }}>
          <h2 className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>Histórico de Pagamentos ({completed.length})</h2>
        </div>
        {completed.length > 0 ? (
          <div>
            {completed.slice(0, 20).map((p: any, i: number) => (
              <div key={p.id} className="flex items-center gap-4 px-6 py-3" style={{ borderBottom: i < Math.min(completed.length, 20) - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: '#1a1a2e' }}>{p.buyer?.name || '—'}</p>
                  <p className="text-[11px] truncate" style={{ color: '#94a3b8' }}>{p.buyer?.email}</p>
                </div>
                <span className="text-[12px] font-medium" style={{ color: '#64748b' }}>{p.product_type === 'crm' ? '💳 CRM Pro' : `${p.quantity}x ${p.product_type === 'lead' ? 'Lead' : p.product_type === 'appointment' ? 'Appt' : p.product_type}`}</span>
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
