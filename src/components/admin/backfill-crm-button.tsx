'use client'

import { useState } from 'react'

/**
 * Botão (admin) que importa do Stripe as cobranças passadas das assinaturas CRM,
 * gravando-as como receita. Idempotente — pode clicar de novo sem duplicar.
 */
export function BackfillCrmButton() {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  async function run() {
    if (loading) return
    if (!confirm('Importar do Stripe todas as cobranças passadas das assinaturas CRM (entram na receita)?\n\nÉ seguro — não duplica o que já foi importado.')) return
    setLoading(true); setDone(null)
    try {
      const r = await fetch('/api/admin/backfill-crm-revenue', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (d.ok) { setDone(`✓ ${d.inserted} importados · ${d.skipped} já existiam · ${d.errors} erros`); if (d.inserted > 0) setTimeout(() => location.reload(), 1500) }
      else setDone('Erro: ' + (d.error || 'falhou'))
    } catch { setDone('Erro de rede') }
    setLoading(false)
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button onClick={run} disabled={loading}
        className="px-3.5 py-1.5 rounded-lg text-[12px] font-bold disabled:opacity-50"
        style={{ background: '#eef2ff', color: '#6366f1', border: '1px solid #c7d2fe' }}>
        {loading ? 'Importando…' : '↻ Importar receita CRM do Stripe'}
      </button>
      {done && <span className="text-[12px] font-semibold" style={{ color: done.startsWith('✓') ? '#15803d' : '#dc2626' }}>{done}</span>}
    </div>
  )
}
