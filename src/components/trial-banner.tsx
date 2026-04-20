'use client'

import Link from 'next/link'
import { useState } from 'react'

export function TrialBanner({ daysLeft }: { daysLeft: number }) {
  const [loading, setLoading] = useState(false)
  const urgent = daysLeft <= 2

  async function subscribe() {
    setLoading(true)
    const r = await fetch('/api/checkout/subscription', { method: 'POST' })
    const d = await r.json()
    if (d.url) window.location.href = d.url
    else setLoading(false)
  }

  return (
    <div
      className="mb-6 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap"
      style={{
        background: urgent
          ? 'linear-gradient(135deg, #fef3c7, #fde68a)'
          : 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
        border: urgent ? '1px solid #fbbf24' : '1px solid #c7d2fe',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-[24px]">{urgent ? '⏰' : '🎁'}</span>
        <div>
          <p className="text-[14px] font-bold" style={{ color: urgent ? '#92400e' : '#3730a3' }}>
            {urgent ? 'Seu trial acaba em breve!' : 'Você está no trial CRM Pro'}
          </p>
          <p className="text-[12px]" style={{ color: urgent ? '#b45309' : '#4f46e5' }}>
            {daysLeft === 1
              ? 'Último dia — todas as features liberadas'
              : `Faltam ${daysLeft} dias — Pipeline, Time, Sequences e Automations ativos`}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link
          href="/dashboard/credits"
          className="px-4 py-2 rounded-lg text-[12px] font-bold"
          style={{ background: '#fff', color: urgent ? '#92400e' : '#3730a3', border: '1px solid rgba(0,0,0,0.1)' }}
        >
          Ver planos
        </Link>
        <button
          onClick={subscribe}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-[12px] font-bold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
          {loading ? '...' : 'Assinar agora'}
        </button>
      </div>
    </div>
  )
}
