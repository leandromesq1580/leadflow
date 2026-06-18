'use client'

import { useState, useEffect } from 'react'
import { StatCard } from '@/components/ui/stat-card'

const PERIODS = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'all', label: 'Tudo' },
]

interface Metrics {
  period: string
  revenue: number; adSpend: number; adSpendOk: boolean; netResult: number
  leadsGenerated: number; assignedInPeriod: number
  soldLeads: number; deliveredPaid: number; owedLeads: number; deliveryPct: number
  payingBuyers: number; totalBuyers: number; pendingAppts: number
}

export function DashboardKpis() {
  const [period, setPeriod] = useState('30d')
  const [m, setM] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/dashboard-metrics?period=${period}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!d.error) setM(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period])

  const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

  return (
    <div className="mb-8">
      <div className="flex gap-2 mb-4">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className="px-4 py-1.5 rounded-full text-[12px] font-bold transition-all"
            style={{ background: period === p.key ? '#6366f1' : '#f1f5f9', color: period === p.key ? '#fff' : '#64748b' }}>
            {p.label}
          </button>
        ))}
      </div>

      {!m ? (
        <div className="text-[13px]" style={{ color: '#94a3b8' }}>{loading ? 'Carregando…' : 'Sem dados'}</div>
      ) : (
        <div className="grid grid-cols-4 gap-4" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
          <StatCard label="Receita" value={usd(m.revenue)} icon="💰" />
          <StatCard label="Gasto Tráfego (Meta)" value={m.adSpendOk ? usd(m.adSpend) : '—'} icon="📣" change={m.adSpendOk ? 'investido em anúncios' : 'Meta indisponível'} />
          <StatCard label="Resultado" value={m.adSpendOk ? `${m.netResult < 0 ? '-' : ''}${usd(Math.abs(m.netResult))}` : '—'} icon={m.netResult >= 0 ? '📈' : '📉'} change={m.adSpendOk ? 'receita − tráfego' : 'precisa do gasto Meta'} trend={m.adSpendOk ? (m.netResult >= 0 ? 'up' : 'down') : undefined} danger={m.adSpendOk && m.netResult < 0} />
          <StatCard label="Leads Gerados" value={m.leadsGenerated.toLocaleString()} icon="📋" change={`${m.assignedInPeriod.toLocaleString()} distribuídos`} />
          <StatCard label="Vendidos (pagos)" value={m.soldLeads.toLocaleString()} icon="🏷️" change="leads que compradores pagaram" />
          <StatCard label="% Entrega" value={`${m.deliveryPct}%`} icon="🚚" change={`${m.deliveredPaid} de ${m.soldLeads} pagos entregues`} />
          <StatCard label="Compradores Pagantes" value={m.payingBuyers} icon="👥" change={`de ${m.totalBuyers} cadastrados`} />
          <StatCard label="Leads Pendentes" value={m.owedLeads} icon="📦" change={`devidos · ${m.pendingAppts} appts`} accent={m.owedLeads > 0} />
        </div>
      )}
    </div>
  )
}
