'use client'

import { useEffect, useState } from 'react'

/**
 * Caixa de ACEITE das políticas (clickwrap) — aparece nas telas de compra enquanto o
 * comprador não aceitou a versão vigente. Sem aceite, o servidor recusa o checkout
 * (HTTP 412). dark=true usa o visual do app mobile.
 */
export function PolicyCheck({ context, dark = false }: { context: string; dark?: boolean }) {
  const [state, setState] = useState<'loading' | 'needed' | 'accepted'>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/policies/accept').then(r => r.json())
      .then(d => { if (alive) setState(d.accepted ? 'accepted' : 'needed') })
      .catch(() => { if (alive) setState('accepted') }) // erro de rede não trava a tela; o gate do servidor decide
    return () => { alive = false }
  }, [])

  if (state !== 'needed') return null

  async function aceitar() {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/policies/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      })
      if (r.ok) setState('accepted')
      else alert('Não consegui registrar o aceite. Tente de novo.')
    } catch { alert('Erro de conexão.') }
    setBusy(false)
  }

  const ink = dark ? 'var(--m-text, #fff)' : '#1a1a2e'
  const mut = dark ? 'var(--m-muted, #94a3b8)' : '#64748b'
  return (
    <div className="rounded-xl p-4 mb-4" style={{
      background: dark ? 'rgba(99,102,241,0.10)' : '#eef2ff',
      border: `1px solid ${dark ? 'rgba(99,102,241,0.35)' : '#c7d2fe'}`,
    }}>
      <p className="text-[13px] font-bold" style={{ color: ink }}>📜 Antes de comprar: aceite a Política de Leads e Uso</p>
      <p className="text-[12px] mt-1" style={{ color: mut }}>
        Regras de entrega, janelas de horário, garantia de troca (14 dias / 8 tentativas), leads frios,
        gravação de ligações e SMS automático.{' '}
        <a href="/politicas" target="_blank" rel="noopener noreferrer" className="font-bold underline" style={{ color: '#6366f1' }}>
          Ler a política completa ↗
        </a>
      </p>
      <label className="flex items-start gap-2 mt-3 cursor-pointer select-none">
        <input type="checkbox" className="mt-0.5 w-4 h-4 accent-indigo-500" checked={false} readOnly
          onClick={aceitar} disabled={busy} />
        <span className="text-[12.5px] font-semibold" style={{ color: ink }}>
          {busy ? 'Registrando aceite…' : 'Li e aceito a Política de Leads e Uso da Plataforma'}
        </span>
      </label>
    </div>
  )
}
