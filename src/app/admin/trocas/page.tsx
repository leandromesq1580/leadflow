'use client'

import { useEffect, useState } from 'react'

interface Req {
  id: string
  status: string
  requested_at: string
  decided_at: string | null
  evidence: { attemptDays?: number; calls?: number; smsSent?: number; capUsed?: number; capMax?: number } | null
  lead: { id: string; name: string; phone: string; state: string } | null
  buyer: { id: string; name: string; email: string } | null
}

/**
 * /admin/trocas — pedidos de troca de lead com o dossiê objetivo (ligações, SMS,
 * silêncio do lead). Aprovar = +1 crédito ao comprador e o lead vira FRIO (estoque).
 */
export default function TrocasPage() {
  const [reqs, setReqs] = useState<Req[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [needsMigration, setNeedsMigration] = useState(false)

  async function load() {
    try {
      const d = await fetch('/api/admin/lead-exchanges', { cache: 'no-store' }).then(r => r.json())
      setReqs(d.requests || [])
      setNeedsMigration(!!d.needsMigration)
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function decide(id: string, action: 'approve' | 'deny') {
    if (busy) return
    if (action === 'approve' && !confirm('Aprovar a troca? O comprador ganha +1 crédito e o lead vira FRIO no estoque.')) return
    setBusy(id)
    try {
      const r = await fetch('/api/admin/lead-exchanges', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      const d = await r.json()
      if (!r.ok) alert(d.error || 'Falhou')
      await load()
    } catch { alert('Erro de conexão') }
    setBusy('')
  }

  const pend = reqs.filter(r => r.status === 'pending')
  const done = reqs.filter(r => r.status !== 'pending')

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>🔁 Trocas de Lead</h1>
      <p className="text-[13px] mt-1 mb-6" style={{ color: '#64748b' }}>
        Elegibilidade automática: 14 dias com o comprador, ≥8 dias com tentativa (ligação/SMS) e ZERO resposta do lead.
        Aprovar devolve 1 crédito e manda o lead pro estoque frio. Teto por comprador: 30% dos leads pagos.
      </p>
      {needsMigration && (
        <div className="rounded-xl p-4 mb-4 text-[13px] font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>
          ⚠️ Migration 032_lead_exchange.sql ainda não foi rodada no Supabase — rode o SQL pra ativar.
        </div>
      )}
      {loading ? <p className="text-[13px]" style={{ color: '#94a3b8' }}>Carregando…</p> : (
        <>
          <h2 className="text-[15px] font-bold mb-3" style={{ color: '#1a1a2e' }}>Pendentes ({pend.length})</h2>
          {pend.length === 0 && <p className="text-[13px] mb-6" style={{ color: '#94a3b8' }}>Nenhum pedido pendente.</p>}
          <div className="space-y-3 mb-8">
            {pend.map(r => {
              const e = r.evidence || {}
              return (
                <div key={r.id} className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>
                        {r.lead?.name || '?'} <span className="font-medium" style={{ color: '#94a3b8' }}>({r.lead?.state || '?'} · {r.lead?.phone || ''})</span>
                      </p>
                      <p className="text-[12px] mt-0.5" style={{ color: '#64748b' }}>
                        Pedido por <b>{r.buyer?.name || r.buyer?.email}</b> em {new Date(r.requested_at).toLocaleDateString('pt-BR')}
                      </p>
                      <p className="text-[12px] mt-2 font-semibold" style={{ color: '#3730a3' }}>
                        📊 {e.attemptDays ?? '?'} dias com tentativa · {e.calls ?? '?'} ligações · {e.smsSent ?? '?'} SMS · 0 respostas · teto {e.capUsed ?? '?'}/{e.capMax ?? '?'}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => decide(r.id, 'approve')} disabled={busy === r.id}
                        className="px-4 py-2 rounded-lg text-[12px] font-bold text-white disabled:opacity-50" style={{ background: '#10b981' }}>
                        Aprovar
                      </button>
                      <button onClick={() => decide(r.id, 'deny')} disabled={busy === r.id}
                        className="px-4 py-2 rounded-lg text-[12px] font-bold disabled:opacity-50" style={{ background: '#fee2e2', color: '#991b1b' }}>
                        Negar
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <h2 className="text-[15px] font-bold mb-3" style={{ color: '#1a1a2e' }}>Histórico ({done.length})</h2>
          <div className="space-y-2">
            {done.map(r => (
              <div key={r.id} className="rounded-xl px-4 py-3 text-[12.5px] flex items-center gap-3" style={{ background: '#fff', border: '1px solid #eef1f6' }}>
                <span>{r.status === 'approved' ? '✅' : '❌'}</span>
                <span className="font-semibold" style={{ color: '#334155' }}>{r.lead?.name || '?'}</span>
                <span style={{ color: '#94a3b8' }}>{r.buyer?.name || r.buyer?.email}</span>
                <span className="ml-auto" style={{ color: '#94a3b8' }}>{r.decided_at ? new Date(r.decided_at).toLocaleDateString('pt-BR') : ''}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
