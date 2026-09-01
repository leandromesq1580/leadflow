'use client'

import { useState, useEffect } from 'react'
import { useT } from '@/lib/i18n-client'

interface Analytics {
  kpis: {
    total_received: number; total_converted: number; total_contacted: number; total_lost: number
    conversion_rate: number; contact_rate: number; total_spent: number; cost_per_conversion: number; total_revenue: number
  }
  daily: { labels: string[]; values: number[] }
  by_source: Record<string, { received: number; converted: number; spent: number }>
  by_interest: Record<string, number>
  funnel: Array<{ stage: string; count: number; position: number }>
}

interface Leader {
  buyer_id: string; name: string; received: number; converted: number; conversion_rate: number; revenue: number
}

export default function PerformancePage() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [buyerId, setBuyerId] = useState('')
  const [isAgency, setIsAgency] = useState(false)
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Analytics | null>(null)
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    if (cookie) {
      try {
        const token = JSON.parse(atob(decodeURIComponent(cookie.substring(cookie.indexOf('=') + 1))))
        const payload = JSON.parse(atob(token.access_token.split('.')[1]))
        fetchBuyer(payload.sub)
      } catch {}
    }
  }, [])

  async function fetchBuyer(authId: string) {
    const r = await fetch(`/api/settings?auth_user_id=${authId}`)
    if (r.ok) {
      const buyer = await r.json()
      setBuyerId(buyer.id)
      setIsAgency(buyer.is_agency || false)
    }
  }

  useEffect(() => {
    if (!buyerId) return
    reload()
  }, [buyerId, days])

  async function reload() {
    setLoading(true)
    const [analytics, leaderboard] = await Promise.all([
      fetch(`/api/analytics?buyer_id=${buyerId}&days=${days}`).then(r => r.json()),
      isAgency ? fetch(`/api/leaderboard?buyer_id=${buyerId}&days=${days}`).then(r => r.json()) : Promise.resolve({ leaders: [] }),
    ])
    setData(analytics)
    setLeaders(leaderboard.leaders || [])
    setLoading(false)
  }

  if (loading) return <div className="p-8 text-[13px]" style={{ color: 'var(--fg-secondary)' }}>{L('Carregando...', 'Loading...', 'Cargando...')}</div>
  if (!data) return <div className="p-8 text-[13px]" style={{ color: 'var(--fg-secondary)' }}>{L('Sem dados', 'No data', 'Sin datos')}</div>

  const maxDaily = Math.max(1, ...data.daily.values)
  const funnelMax = Math.max(1, ...data.funnel.map(f => f.count))

  return (
    <div className="max-w-[1040px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: 'var(--fg)' }}>{t.sidebar.performance}</h1>
          <p className="text-[14px]" style={{ color: 'var(--fg-secondary)' }}>{L('KPIs, ROI por fonte e funil de conversão', 'KPIs, ROI by source and conversion funnel', 'KPIs, ROI por fuente y embudo de conversión')}</p>
        </div>
        <div className="flex rounded-lg p-1" style={{ background: 'var(--bg-soft)' }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className="px-3 py-1.5 rounded-md text-[11px] font-bold transition-all"
              style={{ background: days === d ? 'var(--bg-card)' : 'transparent', color: days === d ? 'var(--accent)' : '#64748b' }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: L('Leads recebidos', 'Leads received', 'Leads recibidos'), value: data.kpis.total_received, color: 'var(--accent)' },
          { label: L('Contatados', 'Contacted', 'Contactados'), value: `${data.kpis.contact_rate}%`, sub: `${data.kpis.total_contacted} leads`, color: '#f59e0b' },
          { label: L('Convertidos', 'Converted', 'Convertidos'), value: `${data.kpis.conversion_rate}%`, sub: `${data.kpis.total_converted} leads`, color: '#10b981' },
          { label: L('Faturamento', 'Revenue', 'Facturación'), value: `$${(data.kpis.total_revenue ?? 0).toLocaleString('en-US')}`, sub: `${data.kpis.total_converted} ${L('contratos fechados', 'contracts closed', 'contratos cerrados')}`, color: '#ec4899' },
        ].map((k, i) => (
          <div key={i} className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>{k.label}</p>
            <p className="text-[22px] font-extrabold mt-1" style={{ color: k.color }}>{k.value}</p>
            {k.sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--fg-muted)' }}>{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* Daily chart */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-[13px] font-bold mb-3" style={{ color: 'var(--fg)' }}>{L('Leads por dia', 'Leads per day', 'Leads por día')}</p>
        <div className="flex items-end gap-1 h-[120px]">
          {data.daily.values.map((v, i) => (
            <div key={i} className="flex-1 h-full flex flex-col justify-end items-center group relative">
              <div className="w-full rounded-t transition-all hover:opacity-80"
                style={{ height: `${(v / maxDaily) * 100}%`, background: 'linear-gradient(180deg, var(--accent), #8b5cf6)', minHeight: v > 0 ? 2 : 0 }}>
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded"
                  style={{ background: '#1a1a2e', color: '#fff' }}>{v}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--fg-muted)' }}>
          <span>{data.daily.labels[0]}</span>
          <span>{data.daily.labels[data.daily.labels.length - 1]}</span>
        </div>
      </div>

      {/* Funnel + By Source */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-[13px] font-bold mb-3" style={{ color: 'var(--fg)' }}>{L('Funil de vendas atual', 'Funnel (current pipeline)', 'Embudo del flujo de ventas actual')}</p>
          {data.funnel.length === 0 ? (
            <p className="text-[12px]" style={{ color: 'var(--fg-muted)' }}>{L('Nenhum lead no funil de vendas', 'No leads in the pipeline', 'No hay prospectos en el flujo de ventas')}</p>
          ) : data.funnel.map(f => (
            <div key={f.stage} className="mb-2">
              <div className="flex justify-between text-[11px] mb-1">
                <span style={{ color: 'var(--fg)' }}>{f.stage}</span>
                <span className="font-bold" style={{ color: 'var(--accent)' }}>{f.count}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-soft)' }}>
                <div className="h-full rounded-full" style={{ width: `${(f.count / funnelMax) * 100}%`, background: 'linear-gradient(90deg, var(--accent), #8b5cf6)' }} />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-[13px] font-bold mb-3" style={{ color: 'var(--fg)' }}>{L('ROI por fonte', 'ROI by source', 'ROI por fuente')}</p>
          {Object.keys(data.by_source).length === 0 ? (
            <p className="text-[12px]" style={{ color: 'var(--fg-muted)' }}>{L('Sem dados', 'No data', 'Sin datos')}</p>
          ) : Object.entries(data.by_source).map(([src, s]) => {
            const rate = s.received > 0 ? ((s.converted / s.received) * 100).toFixed(1) : '0'
            return (
              <div key={src} className="flex justify-between text-[11px] py-2" style={{ borderBottom: '1px solid var(--bg-soft)' }}>
                <span style={{ color: 'var(--fg)' }} className="capitalize">{src}</span>
                <div className="text-right">
                  <span style={{ color: 'var(--fg-secondary)' }}>{s.received} → </span>
                  <span className="font-bold" style={{ color: '#10b981' }}>{s.converted} ({rate}%)</span>
                  <div style={{ color: 'var(--fg-muted)', fontSize: 10 }}>${s.spent.toFixed(0)} {L('faturado', 'in revenue', 'facturado')}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Leaderboard (agency only) */}
      {isAgency && leaders.length > 0 && (
        <div className="rounded-2xl p-5 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-[13px] font-bold mb-3" style={{ color: 'var(--fg)' }}>🏆 {L('Ranking do Time', 'Team Ranking', 'Ranking del Equipo')} ({days}d)</p>
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: 'var(--fg-muted)' }} className="text-[10px] uppercase tracking-wider">
                <th className="text-left py-2">#</th>
                <th className="text-left py-2">{L('Agente', 'Agent', 'Agente')}</th>
                <th className="text-right py-2">{L('Recebidos', 'Received', 'Recibidos')}</th>
                <th className="text-right py-2">{L('Convertidos', 'Converted', 'Convertidos')}</th>
                <th className="text-right py-2">{L('Taxa', 'Rate', 'Tasa')}</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((l, i) => (
                <tr key={l.buyer_id} style={{ borderTop: '1px solid var(--bg-soft)' }}>
                  <td className="py-2.5">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span style={{ color: 'var(--fg-muted)' }}>{i + 1}</span>}
                  </td>
                  <td className="py-2.5 font-bold" style={{ color: 'var(--fg)' }}>{l.name}</td>
                  <td className="py-2.5 text-right" style={{ color: 'var(--fg-secondary)' }}>{l.received}</td>
                  <td className="py-2.5 text-right font-bold" style={{ color: '#10b981' }}>{l.converted}</td>
                  <td className="py-2.5 text-right font-bold" style={{ color: l.conversion_rate >= 20 ? '#10b981' : l.conversion_rate >= 10 ? '#f59e0b' : '#ef4444' }}>
                    {l.conversion_rate.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
