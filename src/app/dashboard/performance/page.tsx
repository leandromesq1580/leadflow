'use client'

import { useState, useEffect } from 'react'

interface Analytics {
  kpis: {
    total_received: number; total_converted: number; total_contacted: number; total_lost: number
    conversion_rate: number; contact_rate: number; total_spent: number; cost_per_conversion: number
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
        const token = JSON.parse(atob(cookie.split('=')[1]))
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

  if (loading) return <div className="p-8 text-[13px]" style={{ color: '#64748b' }}>Carregando...</div>
  if (!data) return <div className="p-8 text-[13px]" style={{ color: '#64748b' }}>Sem dados</div>

  const maxDaily = Math.max(1, ...data.daily.values)
  const funnelMax = Math.max(1, ...data.funnel.map(f => f.count))

  return (
    <div className="max-w-[1040px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Performance</h1>
          <p className="text-[14px]" style={{ color: '#64748b' }}>KPIs, ROI por fonte e funil de conversão</p>
        </div>
        <div className="flex rounded-lg p-1" style={{ background: '#f1f5f9' }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className="px-3 py-1.5 rounded-md text-[11px] font-bold transition-all"
              style={{ background: days === d ? '#fff' : 'transparent', color: days === d ? '#6366f1' : '#64748b' }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Leads recebidos', value: data.kpis.total_received, color: '#6366f1' },
          { label: 'Contatados', value: `${data.kpis.contact_rate}%`, sub: `${data.kpis.total_contacted} leads`, color: '#f59e0b' },
          { label: 'Convertidos', value: `${data.kpis.conversion_rate}%`, sub: `${data.kpis.total_converted} leads`, color: '#10b981' },
          { label: 'Custo / conversão', value: `$${data.kpis.cost_per_conversion}`, sub: `gasto total $${data.kpis.total_spent}`, color: '#ec4899' },
        ].map((k, i) => (
          <div key={i} className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{k.label}</p>
            <p className="text-[22px] font-extrabold mt-1" style={{ color: k.color }}>{k.value}</p>
            {k.sub && <p className="text-[10px] mt-0.5" style={{ color: '#94a3b8' }}>{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* Daily chart */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <p className="text-[13px] font-bold mb-3" style={{ color: '#1a1a2e' }}>Leads por dia</p>
        <div className="flex items-end gap-1 h-[120px]">
          {data.daily.values.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center group relative">
              <div className="w-full rounded-t transition-all hover:opacity-80"
                style={{ height: `${(v / maxDaily) * 100}%`, background: 'linear-gradient(180deg, #6366f1, #8b5cf6)', minHeight: v > 0 ? 2 : 0 }}>
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded"
                  style={{ background: '#1a1a2e', color: '#fff' }}>{v}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[9px] mt-1" style={{ color: '#94a3b8' }}>
          <span>{data.daily.labels[0]}</span>
          <span>{data.daily.labels[data.daily.labels.length - 1]}</span>
        </div>
      </div>

      {/* Funnel + By Source */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[13px] font-bold mb-3" style={{ color: '#1a1a2e' }}>Funil (pipeline atual)</p>
          {data.funnel.length === 0 ? (
            <p className="text-[12px]" style={{ color: '#94a3b8' }}>Nenhum lead no pipeline</p>
          ) : data.funnel.map(f => (
            <div key={f.stage} className="mb-2">
              <div className="flex justify-between text-[11px] mb-1">
                <span style={{ color: '#1a1a2e' }}>{f.stage}</span>
                <span className="font-bold" style={{ color: '#6366f1' }}>{f.count}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                <div className="h-full rounded-full" style={{ width: `${(f.count / funnelMax) * 100}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[13px] font-bold mb-3" style={{ color: '#1a1a2e' }}>ROI por fonte</p>
          {Object.keys(data.by_source).length === 0 ? (
            <p className="text-[12px]" style={{ color: '#94a3b8' }}>Sem dados</p>
          ) : Object.entries(data.by_source).map(([src, s]) => {
            const rate = s.received > 0 ? ((s.converted / s.received) * 100).toFixed(1) : '0'
            return (
              <div key={src} className="flex justify-between text-[11px] py-2" style={{ borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#1a1a2e' }} className="capitalize">{src}</span>
                <div className="text-right">
                  <span style={{ color: '#64748b' }}>{s.received} → </span>
                  <span className="font-bold" style={{ color: '#10b981' }}>{s.converted} ({rate}%)</span>
                  <div style={{ color: '#94a3b8', fontSize: 10 }}>${s.spent.toFixed(0)} gasto</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Leaderboard (agency only) */}
      {isAgency && leaders.length > 0 && (
        <div className="rounded-2xl p-5 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[13px] font-bold mb-3" style={{ color: '#1a1a2e' }}>🏆 Ranking do Time ({days}d)</p>
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: '#94a3b8' }} className="text-[10px] uppercase tracking-wider">
                <th className="text-left py-2">#</th>
                <th className="text-left py-2">Agente</th>
                <th className="text-right py-2">Recebidos</th>
                <th className="text-right py-2">Convertidos</th>
                <th className="text-right py-2">Taxa</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((l, i) => (
                <tr key={l.buyer_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td className="py-2.5">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span style={{ color: '#94a3b8' }}>{i + 1}</span>}
                  </td>
                  <td className="py-2.5 font-bold" style={{ color: '#1a1a2e' }}>{l.name}</td>
                  <td className="py-2.5 text-right" style={{ color: '#64748b' }}>{l.received}</td>
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
