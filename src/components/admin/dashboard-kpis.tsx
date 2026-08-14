'use client'

import { useState, useEffect } from 'react'
import { StatCard } from '@/components/ui/stat-card'

const PERIODS = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'this_month', label: 'Este mês' },
  { key: 'last_month', label: 'Mês passado' },
  { key: 'all', label: 'Tudo' },
]

interface Metrics {
  period: string
  revenue: number; adSpend: number; adSpendOk: boolean; netResult: number
  leadPkgRevenue: number; coldLeadRevenue: number; leadSalesRevenue: number; leadProfit: number; cpl: number
  leadsGenerated: number; assignedInPeriod: number
  soldLeads: number; deliveredPaid: number; owedLeads: number; deliveryPct: number
  payingBuyers: number; totalBuyers: number; pendingAppts: number
}

export function DashboardKpis() {
  const [period, setPeriod] = useState('all')
  const [m, setM] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    // Corte de data no FUSO LOCAL do navegador — "Hoje" = o SEU dia, não o dia UTC.
    function range() {
      const now = new Date()
      let since = '', until = ''
      if (period === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); since = d.toISOString() }
      else if (period === '7d') since = new Date(now.getTime() - 7 * 86400_000).toISOString()
      else if (period === '30d') since = new Date(now.getTime() - 30 * 86400_000).toISOString()
      else if (period === 'this_month') since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      else if (period === 'last_month') { since = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(); until = new Date(now.getFullYear(), now.getMonth(), 1).toISOString() }
      return { since, until }
    }
    async function load() {
      const { since, until } = range()
      try {
        const d = await fetch(`/api/admin/dashboard-metrics?period=${period}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`, { cache: 'no-store' }).then(r => r.json())
        if (alive && !d.error) setM(d)
      } catch {}
      if (alive) setLoading(false)
    }
    setLoading(true)
    load()
    // KPIs AO VIVO: refaz a cada 15s + quando a aba volta ao foco (navegador congela
    // timers de aba em 2o plano). Antes carregava 1x e ficava parado ate recarregar.
    const t = setInterval(load, 15000)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [period])

  const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

  return (
    <div className="mb-8">
      <div className="flex gap-2 mb-4">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className="px-4 py-1.5 rounded-full text-[12px] font-bold transition-all"
            style={{ background: period === p.key ? 'var(--accent)' : 'var(--bg-soft)', color: period === p.key ? 'var(--bg-card)' : '#64748b' }}>
            {p.label}
          </button>
        ))}
      </div>

      {!m ? (
        <div className="text-[13px]" style={{ color: 'var(--fg-muted)' }}>{loading ? 'Carregando…' : 'Sem dados'}</div>
      ) : (
        <div className="grid grid-cols-4 gap-4" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
          <StatCard label="Receita" value={usd(m.revenue)} icon="💰" />
          <StatCard label="Gasto Tráfego (Meta)" value={m.adSpendOk ? usd(m.adSpend) : '—'} icon="📣" change={m.adSpendOk ? 'investido em anúncios' : 'Meta indisponível'} />
          <StatCard label="Lucro" value={m.adSpendOk ? `${m.netResult < 0 ? '-' : ''}${usd(Math.abs(m.netResult))}` : '—'} icon={m.netResult >= 0 ? '📈' : '📉'} change={m.adSpendOk ? (m.revenue > 0 ? `Margem ${Math.round((m.netResult / m.revenue) * 100)}%` : 'receita − tráfego') : 'precisa do gasto Meta'} trend={m.adSpendOk ? (m.netResult >= 0 ? 'up' : 'down') : undefined} danger={m.adSpendOk && m.netResult < 0} />
          <StatCard label="Leads Gerados" value={m.leadsGenerated.toLocaleString()} icon="📋" change={`${m.assignedInPeriod.toLocaleString()} distribuídos`} />
          <StatCard label="Vendidos (pagos)" value={m.soldLeads.toLocaleString()} icon="🏷️" change="leads que compradores pagaram" />
          <StatCard label="% Entrega" value={`${m.deliveryPct}%`} icon="🚚" change={`${m.deliveredPaid} de ${m.soldLeads} pagos entregues`} />
          <StatCard label="Compradores Pagantes" value={m.payingBuyers} icon="👥" change={`de ${m.totalBuyers} cadastrados`} />
          <StatCard label="Leads Pendentes" value={m.owedLeads} icon="📦" change={`devidos · ${m.pendingAppts} appts`} accent={m.owedLeads > 0} />
        </div>
      )}

      {/* Operação de LEADS: venda de leads × custo de gerar — a assinatura CRM fica de fora
          de propósito (já está na Receita geral acima). Responde "vender lead dá lucro?" */}
      {m && (
        <>
          <h3 className="text-[13px] font-bold uppercase tracking-wider mt-6 mb-3" style={{ color: 'var(--fg-secondary)' }}>
            🎯 Operação de Leads — venda × custo de geração
          </h3>
          <div className="grid grid-cols-4 gap-4" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}>
            <StatCard label="Receita de Leads" value={usd(m.leadSalesRevenue)} icon="🏷️"
              change={`${usd(m.leadPkgRevenue)} pacotes · ${usd(m.coldLeadRevenue)} frios (sem assinaturas)`} />
            <StatCard label="Custo de Geração" value={m.adSpendOk ? usd(m.adSpend) : '—'} icon="📣"
              change={m.adSpendOk ? 'Campanha Leads Seguro' : 'Meta indisponível'} />
            <StatCard label="Lucro dos Leads" value={m.adSpendOk ? `${m.leadProfit < 0 ? '-' : ''}${usd(Math.abs(m.leadProfit))}` : '—'}
              icon={m.leadProfit >= 0 ? '📈' : '📉'}
              change={m.adSpendOk ? (m.leadSalesRevenue > 0 ? `Margem ${Math.round((m.leadProfit / m.leadSalesRevenue) * 100)}%` : 'venda de leads − tráfego') : 'precisa do gasto Meta'}
              trend={m.adSpendOk ? (m.leadProfit >= 0 ? 'up' : 'down') : undefined}
              danger={m.adSpendOk && m.leadProfit < 0} />
            <StatCard label="Custo por Lead (CPL)" value={m.adSpendOk && m.leadsGenerated > 0 ? `$${m.cpl.toFixed(2)}` : '—'} icon="🧮"
              change={m.leadsGenerated > 0 ? `${usd(m.adSpend)} ÷ ${m.leadsGenerated} leads gerados` : 'sem leads no período'} />
          </div>
        </>
      )}
    </div>
  )
}
