import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const STATUS: Record<string, { label: string; bg: string; color: string }> = {
  needs_response: { label: 'Precisa responder', bg: '#fef2f2', color: '#b91c1c' },
  warning_needs_response: { label: 'Atenção', bg: '#fff7ed', color: '#c2410c' },
  under_review: { label: 'Em análise', bg: '#eff6ff', color: '#1d4ed8' },
  won: { label: 'Ganho', bg: '#ecfdf5', color: '#047857' },
  lost: { label: 'Perdido', bg: '#f8fafc', color: '#475569' },
}

export default async function ChargebacksPage() {
  const db = createAdminClient()
  const { data: cases, error } = await db.from('chargeback_cases').select('*')
    .order('created_at', { ascending: false }).limit(100)
  const buyerIds = [...new Set((cases || []).map(row => row.buyer_id).filter(Boolean))]
  const { data: buyers } = buyerIds.length
    ? await db.from('buyers').select('id, name, email').in('id', buyerIds)
    : { data: [] as any[] }
  const buyerById = new Map((buyers || []).map(b => [b.id, b]))

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Central de Chargebacks</h1>
        <p className="mt-1 text-sm text-slate-500">Disputas recebidas da Stripe, prazo e dossiê de evidências. Revise sempre antes de enviar à Stripe.</p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">A central ainda não está disponível: {error.message}</div>
      ) : !cases?.length ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">Nenhuma contestação registrada.</div>
      ) : (
        <div className="space-y-3">
          {cases.map(item => {
            const buyer = buyerById.get(item.buyer_id)
            const badge = STATUS[item.status] || { label: item.status, bg: '#f1f5f9', color: '#475569' }
            return (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-base text-slate-900">{buyer?.name || 'Cliente não localizado'}</strong>
                      <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{buyer?.email || '—'} · {item.stripe_dispute_id}</p>
                    <p className="mt-2 text-sm text-slate-700">Motivo: <b>{item.reason || 'não informado'}</b> · Valor: <b>{String(item.currency || 'usd').toUpperCase()} {(Number(item.amount_cents || 0) / 100).toFixed(2)}</b></p>
                    <p className="mt-1 text-xs text-slate-500">Prazo: {item.evidence_due_by ? new Date(item.evidence_due_by).toLocaleString('pt-BR') : 'consultar Stripe'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`/api/admin/chargebacks/${item.id}/dossier`} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">Baixar dossiê PDF</a>
                    <a href={`https://dashboard.stripe.com/disputes/${item.stripe_dispute_id}`} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Abrir na Stripe</a>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
