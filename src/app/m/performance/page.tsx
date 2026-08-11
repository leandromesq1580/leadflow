'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'

interface Analytics {
  kpis: { total_received: number; total_converted: number; total_contacted: number; conversion_rate: number; contact_rate: number; total_revenue: number }
  daily: { labels: string[]; values: number[] }
  by_source: Record<string, { received: number; converted: number; spent: number }>
  funnel: Array<{ stage: string; count: number; position: number }>
}
interface Leader { buyer_id: string; name: string; received: number; converted: number; conversion_rate: number }

export default function MobilePerformance() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const router = useRouter()

  const [buyerId, setBuyerId] = useState<string | null>(null)
  const [isAgency, setIsAgency] = useState(false)
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Analytics | null>(null)
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [err, setErr] = useState(false)

  useEffect(() => {
    fetch('/api/m/team-context', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d?.buyer_id) { setErr(true); return }
      setBuyerId(d.buyer_id); setIsAgency(!!d.is_agency)
    }).catch(() => setErr(true))
  }, [])

  useEffect(() => {
    if (!buyerId) return
    fetch(`/api/analytics?buyer_id=${buyerId}&days=${days}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setData(d) }).catch(() => setErr(true))
    if (isAgency) fetch(`/api/leaderboard?buyer_id=${buyerId}&days=${days}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setLeaders(d.leaders || []) }).catch(() => {})
  }, [buyerId, days, isAgency])

  const kpis = data?.kpis
  const dailyMax = Math.max(1, ...(data?.daily.values || [0]))
  const funnelMax = Math.max(1, ...(data?.funnel || []).map(f => f.count))
  const sources = Object.entries(data?.by_source || {}).sort((a, b) => b[1].received - a[1].received)
  const fmtMoney = (n: number) => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

  const kpiCards = kpis ? [
    { label: L('Recebidos', 'Received', 'Recibidos'), value: kpis.total_received, color: '#6366f1' },
    { label: L('Contatados', 'Contacted', 'Contactados'), value: `${kpis.contact_rate}%`, sub: `${kpis.total_contacted}`, color: '#f59e0b' },
    { label: L('Convertidos', 'Converted', 'Convertidos'), value: `${kpis.conversion_rate}%`, sub: `${kpis.total_converted}`, color: '#10b981' },
    { label: L('Faturamento', 'Revenue', 'Facturación'), value: fmtMoney(kpis.total_revenue), color: '#ec4899' },
  ] : []

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 6, display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
        <button onClick={() => router.push('/m/mais')} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="arrowLeft" size={24} /></button>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Performance</p>
      </div>

      <div className="m-pad" style={{ display: 'flex', gap: 8, paddingTop: 6, paddingBottom: 14 }}>
        {[7, 30, 90].map(d => (
          <span key={d} className={`m-chip m-tap${days === d ? ' on' : ''}`} onClick={() => setDays(d)}>{d} {L('dias', 'days', 'días')}</span>
        ))}
      </div>

      {!data && !err && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="m-spin" /></div>}
      {err && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40 }}>{L('Não consegui carregar agora.', "Couldn't load right now.", 'No pude cargar ahora.')}</p>}

      {data && (
        <div className="m-pad">
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginBottom: 18 }}>
            {kpiCards.map((k, i) => (
              <div key={i} className="m-card" style={{ padding: 14 }}>
                <p style={{ margin: 0, fontSize: 23, fontWeight: 800, color: k.color }}>{k.value}</p>
                <p className="m-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{k.label}{k.sub ? ` · ${k.sub}` : ''}</p>
              </div>
            ))}
          </div>

          {/* Leads por dia */}
          <div className="m-card" style={{ padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>{L('Leads por dia', 'Leads per day', 'Leads por día')}</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
              {data.daily.values.map((v, i) => (
                <div key={i} style={{ flex: 1, height: `${Math.max(3, (v / dailyMax) * 100)}%`, background: 'linear-gradient(180deg,#8b5cf6,#6366f1)', borderRadius: 3, minHeight: 3 }} title={`${v}`} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span className="m-faint" style={{ fontSize: 11 }}>{data.daily.labels[0]}</span>
              <span className="m-faint" style={{ fontSize: 11 }}>{data.daily.labels[data.daily.labels.length - 1]}</span>
            </div>
          </div>

          {/* Funil */}
          <div className="m-card" style={{ padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 14px' }}>{L('Funil (pipeline atual)', 'Funnel (current pipeline)', 'Embudo (pipeline actual)')}</p>
            {data.funnel.length === 0 ? <p className="m-muted" style={{ fontSize: 13, margin: 0 }}>{L('Nenhum lead no pipeline.', 'No leads in pipeline.', 'Sin leads.')}</p>
              : data.funnel.map((f, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 13 }}>{f.stage}</span><span className="m-muted" style={{ fontSize: 13, fontWeight: 600 }}>{f.count}</span></div>
                  <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.07)' }}><div style={{ width: `${(f.count / funnelMax) * 100}%`, height: 7, borderRadius: 999, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }} /></div>
                </div>
              ))}
          </div>

          {/* ROI por fonte */}
          {sources.length > 0 && (
            <div className="m-card" style={{ padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>{L('Por fonte', 'By source', 'Por fuente')}</p>
              {sources.map(([name, s]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
                    <p className="m-muted" style={{ margin: '1px 0 0', fontSize: 12 }}>{s.received} → {s.converted} ({s.received ? Math.round((s.converted / s.received) * 100) : 0}%)</p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>{fmtMoney(s.spent)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Ranking (agência) */}
          {isAgency && leaders.length > 0 && (
            <div className="m-card" style={{ padding: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>{L('Ranking do time', 'Team ranking', 'Ranking del equipo')}</p>
              {leaders.map((l, i) => (
                <div key={l.buyer_id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: i < leaders.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <span style={{ fontSize: 15, width: 22, textAlign: 'center' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                  <span className="m-muted" style={{ fontSize: 12 }}>{l.received} · {l.conversion_rate}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
