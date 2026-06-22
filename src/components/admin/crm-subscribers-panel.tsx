import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import Link from 'next/link'

/**
 * Painel CRM Pro pro admin: MRR + quem PAGA (assinatura Stripe ativa, com data do
 * ultimo pagamento + proxima cobranca, buscadas no Stripe) vs cortesias (Pro na mao).
 * Sempre do mais recente pro mais antigo. Server component — usado no dashboard e na Receita.
 */
export async function CrmSubscribersPanel() {
  const db = createAdminClient()
  const { data: buyers } = await db
    .from('buyers')
    .select('id, name, email, crm_plan, crm_subscription_status, crm_subscription_id, created_at')
    .eq('crm_plan', 'pro')
  const pro = (buyers || []) as any[]
  const payers = pro.filter(b => !!b.crm_subscription_id && b.crm_subscription_status === 'active')
  const courtesy = pro.filter(b => !(!!b.crm_subscription_id && b.crm_subscription_status === 'active'))

  // Datas reais no Stripe (crm_expires_at do banco esta NULL). period_start = ultimo pgto.
  const subDates: Record<string, { paid: number | null; renews: number | null }> = {}
  try {
    const stripe = getStripe()
    const rows = await Promise.all(payers.map(async (b) => {
      try {
        const s: any = await stripe.subscriptions.retrieve(b.crm_subscription_id)
        const it = s.items?.data?.[0] || {}
        return { id: b.id, paid: s.current_period_start ?? it.current_period_start ?? null, renews: s.current_period_end ?? it.current_period_end ?? null }
      } catch { return { id: b.id, paid: null, renews: null } }
    }))
    for (const r of rows) subDates[r.id] = { paid: r.paid, renews: r.renews }
  } catch {}
  const fmtTs = (ts: number | null) => ts ? new Date(ts * 1000).toLocaleDateString('pt-BR') : null

  // Sempre do mais recente pro mais antigo
  payers.sort((a, b) => (subDates[b.id]?.paid ?? 0) - (subDates[a.id]?.paid ?? 0) || new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  courtesy.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  const mrr = payers.length * 99

  return (
    <div className="rounded-2xl overflow-hidden mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
      <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>💳 CRM Pro — quem paga</h2>
        <span className="text-[13px] font-extrabold" style={{ color: '#15803d' }}>MRR ${mrr.toLocaleString()} · {payers.length} pagante{payers.length === 1 ? '' : 's'} · {courtesy.length} cortesia</span>
      </div>
      {payers.length === 0 && courtesy.length === 0 ? (
        <p className="text-center py-8 text-[13px]" style={{ color: '#94a3b8' }}>Nenhum assinante Pro</p>
      ) : (
        <div>
          {payers.map((b) => (
            <Link key={b.id} href={`/admin/buyers/${b.id}`} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold truncate" style={{ color: '#1a1a2e' }}>{b.name}</p>
                <p className="text-[11px] truncate" style={{ color: '#94a3b8' }}>{b.email}</p>
              </div>
              <div className="text-right hidden sm:block flex-shrink-0">
                <p className="text-[11px] font-semibold" style={{ color: '#64748b' }}>{fmtTs(subDates[b.id]?.paid ?? null) ? `pgto ${fmtTs(subDates[b.id]?.paid ?? null)}` : '—'}</p>
                <p className="text-[10px]" style={{ color: '#94a3b8' }}>{fmtTs(subDates[b.id]?.renews ?? null) ? `renova ${fmtTs(subDates[b.id]?.renews ?? null)}` : ''}</p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase flex-shrink-0" style={{ background: '#dcfce7', color: '#15803d' }}>Paga $99/mês</span>
            </Link>
          ))}
          {courtesy.map((b, i) => (
            <Link key={b.id} href={`/admin/buyers/${b.id}`} className="flex items-center gap-4 px-6 py-3 hover:bg-slate-50" style={{ borderBottom: i < courtesy.length - 1 ? '1px solid #f1f5f9' : 'none', opacity: 0.7 }}>
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
  )
}
