'use client'

import { useEffect, useState } from 'react'

interface Elig {
  eligible: boolean
  reasons: string[]
  dossier: { attemptDays: number; calls: number; smsSent: number; capUsed: number; capMax: number }
  request?: { status: string } | null
}

/**
 * Caixa "Troca de lead" (aba Detalhes). Aparece o botão quando o lead cumpre a
 * régua (14 dias, ≥8 dias com tentativa, 0 respostas). Pedido vai pro admin aprovar.
 */
export function ExchangeBox({ leadId }: { leadId: string }) {
  const [e, setE] = useState<Elig | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let alive = true
    fetch(`/api/leads/${leadId}/exchange`).then(r => r.json())
      .then(d => { if (alive && !d.error) setE(d) }).catch(() => {})
    return () => { alive = false }
  }, [leadId])

  if (!e) return null
  const st = e.request?.status

  async function solicitar() {
    if (busy) return
    if (!confirm('Solicitar a TROCA deste lead? Ele sai da sua conta se aprovado e você recebe 1 crédito de volta.')) return
    setBusy(true)
    try {
      const r = await fetch(`/api/leads/${leadId}/exchange`, { method: 'POST' })
      const d = await r.json()
      if (r.ok) { setE({ ...e!, request: { status: 'pending' } }); setMsg('') }
      else setMsg(d.error || 'Não consegui solicitar.')
    } catch { setMsg('Erro de conexão.') }
    setBusy(false)
  }

  const d = e.dossier
  const chip = (txt: string, color: string, bg: string) => (
    <div className="rounded-xl p-3 mt-3 text-[12px] font-semibold" style={{ background: bg, color }}>{txt}</div>
  )

  if (st === 'pending') return chip('🔁 Troca solicitada — aguardando análise do admin.', '#92400e', '#fef3c7')
  if (st === 'approved') return chip('✅ Troca aprovada — crédito devolvido.', '#065f46', '#d1fae5')
  if (st === 'denied') return chip('❌ Pedido de troca negado pelo admin.', '#991b1b', '#fee2e2')

  if (e.eligible) {
    return (
      <div className="rounded-xl p-4 mt-3" style={{ background: '#eef2ff', border: '1px solid #c7d2fe' }}>
        <p className="text-[13px] font-bold" style={{ color: '#3730a3' }}>🔁 Este lead é elegível pra troca</p>
        <p className="text-[12px] mt-1" style={{ color: '#4f46e5' }}>
          {d.attemptDays} dias com tentativa · {d.calls} ligações · {d.smsSent} SMS · nenhuma resposta em 14 dias.
        </p>
        <button onClick={solicitar} disabled={busy}
          className="mt-3 px-4 py-2 rounded-lg text-[12px] font-bold text-white disabled:opacity-50"
          style={{ background: '#6366f1' }}>
          {busy ? 'Enviando…' : 'Solicitar troca (+1 crédito se aprovada)'}
        </button>
        {msg && <p className="text-[12px] mt-2" style={{ color: '#dc2626' }}>{msg}</p>}
      </div>
    )
  }
  return null // não elegível e sem pedido: não polui a tela
}
