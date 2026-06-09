'use client'

import { useState } from 'react'

/** Barra fixa no topo quando o admin está usando "Ver como" outro usuário. */
export function ImpersonationBanner({ name }: { name: string }) {
  const [busy, setBusy] = useState(false)

  async function stop() {
    setBusy(true)
    try {
      await fetch('/api/admin/impersonate/stop', { method: 'POST' })
    } catch {}
    window.location.href = '/admin'
  }

  return (
    <div
      className="flex items-center justify-center gap-3 px-4 py-2.5 mb-4 rounded-xl"
      style={{ background: 'linear-gradient(135deg, #1a1a2e, #312e81)', color: '#fff' }}
    >
      <span className="text-[13px] font-semibold">
        👁 Você está vendo o sistema como <strong>{name}</strong>
      </span>
      <button
        onClick={stop}
        disabled={busy}
        className="text-[12px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
        style={{ background: '#fff', color: '#312e81' }}
      >
        {busy ? 'Voltando…' : '← Voltar para admin'}
      </button>
    </div>
  )
}
