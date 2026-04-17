'use client'

import { useState } from 'react'

interface Props {
  leadId: string
  score?: number | null
  reason?: string | null
  onScored?: (score: number, reason: string) => void
  compact?: boolean
}

export function AiScoreBadge({ leadId, score, reason, onScored, compact }: Props) {
  const [loading, setLoading] = useState(false)

  async function rescore() {
    setLoading(true)
    const r = await fetch(`/api/leads/${leadId}/score`, { method: 'POST' })
    setLoading(false)
    if (r.ok) {
      const { score: s, reason: rsn } = await r.json()
      onScored?.(s, rsn)
    } else {
      const d = await r.json()
      alert(d.error || 'Erro ao calcular score')
    }
  }

  if (score == null) {
    return (
      <button onClick={rescore} disabled={loading}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold disabled:opacity-50"
        style={{ background: '#f1f5f9', color: '#64748b', border: '1px dashed #cbd5e1' }}>
        {loading ? '⏳ Analisando...' : '✨ Calcular Score'}
      </button>
    )
  }

  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  const emoji = score >= 70 ? '🔥' : score >= 40 ? '☀️' : '❄️'
  const label = score >= 70 ? 'HOT' : score >= 40 ? 'MORNO' : 'FRIO'

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
        style={{ background: color + '22', color, border: `1px solid ${color}44` }}
        title={reason || ''}>
        {emoji} {score}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold"
        style={{ background: color + '22', color, border: `1px solid ${color}44` }}>
        {emoji} {label} · Score {score}
      </span>
      {reason && <span className="text-[11px]" style={{ color: '#64748b' }}>{reason}</span>}
      <button onClick={rescore} disabled={loading} className="text-[10px] font-bold" style={{ color: '#6366f1' }}>
        {loading ? '...' : '↻'}
      </button>
    </div>
  )
}
