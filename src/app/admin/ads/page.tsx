'use client'

import { useState, useEffect } from 'react'

interface Row {
  name: string
  campaign_name: string
  adset_name: string
  ad_name: string
  region: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  leads: number
  cpl: number
  revenue: number
  margin: number
  roi: number
}

interface Data {
  rows: Row[]
  totals: {
    spend: number; impressions: number; clicks: number
    leads: number; revenue: number; margin: number; cpl: number; roi: number
  }
  period: string
  level: string
}

const PERIODS = [
  { key: 'today', label: 'Hoje' },
  { key: 'last_7d', label: '7 dias' },
  { key: 'last_30d', label: '30 dias' },
  { key: 'last_90d', label: '90 dias' },
]

const TABS = [
  { key: 'campaign', label: 'Campanhas' },
  { key: 'adset', label: 'Ad Sets' },
  { key: 'ad', label: 'Criativos' },
  { key: 'region', label: 'Por Estado' },
]

function fmt(n: number) { return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtInt(n: number) { return n.toLocaleString('en-US') }

export default function AdsPage() {
  const [period, setPeriod] = useState('last_7d')
  const [tab, setTab] = useState('campaign')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [period, tab])

  async function load() {
    setLoading(true)
    const isRegion = tab === 'region'
    const params = `period=${period}&${isRegion ? 'breakdown=region' : `level=${tab}`}`
    const res = await fetch(`/api/admin/ads-insights?${params}`)
    const d = await res.json()
    setData(d)
    setLoading(false)
  }

  const t = data?.totals
  const rows = data?.rows || []

  return (
    <div className="max-w-[1200px]">
      <div className="mb-6">
        <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Meta Ads</h1>
        <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>Performance das campanhas e margem por lead</p>
      </div>

      {/* Period filter */}
      <div className="flex gap-2 mb-6">
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriod(p.key)}
            className="px-4 py-2 rounded-xl text-[13px] font-bold transition-all"
            style={{
              background: period === p.key ? '#6366f1' : '#fff',
              color: period === p.key ? '#fff' : '#64748b',
              border: `1px solid ${period === p.key ? '#6366f1' : '#e8ecf4'}`,
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {t && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Investido</p>
            <p className="text-[28px] font-extrabold" style={{ color: '#ef4444' }}>${fmt(t.spend)}</p>
          </div>
          <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Leads</p>
            <p className="text-[28px] font-extrabold" style={{ color: '#6366f1' }}>{t.leads}</p>
            <p className="text-[12px] font-semibold" style={{ color: '#94a3b8' }}>CPL: ${fmt(t.cpl)}</p>
          </div>
          <div className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Receita (vendas)</p>
            <p className="text-[28px] font-extrabold" style={{ color: '#10b981' }}>${fmt(t.revenue)}</p>
            <p className="text-[12px] font-semibold" style={{ color: '#94a3b8' }}>{t.leads} × $22/lead</p>
          </div>
          <div className="rounded-xl p-5" style={{ background: t.margin >= 0 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${t.margin >= 0 ? '#bbf7d0' : '#fecaca'}` }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Margem</p>
            <p className="text-[28px] font-extrabold" style={{ color: t.margin >= 0 ? '#10b981' : '#ef4444' }}>
              {t.margin >= 0 ? '+' : ''}${fmt(t.margin)}
            </p>
            <p className="text-[12px] font-semibold" style={{ color: t.roi >= 1 ? '#10b981' : '#ef4444' }}>ROI: {fmt(t.roi)}x</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: '#f1f5f9' }}>
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className="flex-1 py-2.5 rounded-lg text-[13px] font-bold transition-all"
            style={{
              background: tab === tb.key ? '#fff' : 'transparent',
              color: tab === tb.key ? '#6366f1' : '#64748b',
              boxShadow: tab === tb.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        {loading ? (
          <div className="text-center py-16">
            <p className="text-[14px]" style={{ color: '#94a3b8' }}>Carregando dados do Meta Ads...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[14px]" style={{ color: '#94a3b8' }}>Sem dados neste periodo</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: '1px solid #e8ecf4' }}>
                  <th className="text-left px-5 py-3 font-bold" style={{ color: '#94a3b8' }}>
                    {tab === 'region' ? 'Estado' : tab === 'ad' ? 'Criativo' : tab === 'adset' ? 'Ad Set' : 'Campanha'}
                  </th>
                  <th className="text-right px-3 py-3 font-bold" style={{ color: '#94a3b8' }}>Spend</th>
                  <th className="text-right px-3 py-3 font-bold hidden md:table-cell" style={{ color: '#94a3b8' }}>Impr.</th>
                  <th className="text-right px-3 py-3 font-bold hidden md:table-cell" style={{ color: '#94a3b8' }}>Cliques</th>
                  <th className="text-right px-3 py-3 font-bold" style={{ color: '#94a3b8' }}>Leads</th>
                  <th className="text-right px-3 py-3 font-bold" style={{ color: '#94a3b8' }}>CPL</th>
                  <th className="text-right px-3 py-3 font-bold hidden sm:table-cell" style={{ color: '#94a3b8' }}>Receita</th>
                  <th className="text-right px-3 py-3 font-bold" style={{ color: '#94a3b8' }}>Margem</th>
                  <th className="text-right px-5 py-3 font-bold hidden sm:table-cell" style={{ color: '#94a3b8' }}>ROI</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .sort((a, b) => b.spend - a.spend)
                  .map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td className="px-5 py-3 font-semibold max-w-[200px] truncate" style={{ color: '#1a1a2e' }}>
                      {row.name}
                      {tab === 'ad' && row.adset_name && (
                        <span className="block text-[11px] font-normal" style={{ color: '#94a3b8' }}>{row.adset_name}</span>
                      )}
                    </td>
                    <td className="text-right px-3 py-3 font-semibold" style={{ color: '#ef4444' }}>${fmt(row.spend)}</td>
                    <td className="text-right px-3 py-3 hidden md:table-cell" style={{ color: '#64748b' }}>{fmtInt(row.impressions)}</td>
                    <td className="text-right px-3 py-3 hidden md:table-cell" style={{ color: '#64748b' }}>{fmtInt(row.clicks)}</td>
                    <td className="text-right px-3 py-3 font-bold" style={{ color: '#6366f1' }}>{row.leads}</td>
                    <td className="text-right px-3 py-3" style={{ color: row.cpl > 0 ? '#1a1a2e' : '#94a3b8' }}>
                      {row.cpl > 0 ? `$${fmt(row.cpl)}` : '—'}
                    </td>
                    <td className="text-right px-3 py-3 hidden sm:table-cell" style={{ color: '#10b981' }}>
                      {row.revenue > 0 ? `$${fmt(row.revenue)}` : '—'}
                    </td>
                    <td className="text-right px-3 py-3 font-bold" style={{ color: row.margin >= 0 ? '#10b981' : '#ef4444' }}>
                      {row.leads > 0 ? `${row.margin >= 0 ? '+' : ''}$${fmt(row.margin)}` : '—'}
                    </td>
                    <td className="text-right px-5 py-3 hidden sm:table-cell font-bold" style={{ color: row.roi >= 1 ? '#10b981' : '#f59e0b' }}>
                      {row.roi > 0 ? `${fmt(row.roi)}x` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
