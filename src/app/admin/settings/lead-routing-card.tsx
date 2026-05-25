'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Buyer { id: string; name: string; email: string }
interface Step { email: string; limit: number; delivered: number }
interface Routing {
  mode: 'normal' | 'exclusive' | 'random' | 'roundrobin' | 'sequential'
  exclusive_email?: string | null
  pool_emails?: string[]
  steps?: Step[]
  fallback_mode?: 'normal' | 'exclusive'
  fallback_email?: string | null
}

const MODES: { v: Routing['mode']; label: string; desc: string }[] = [
  { v: 'normal', label: '🔄 Normal', desc: 'Por créditos + estado (padrão do sistema)' },
  { v: 'exclusive', label: '🎯 Exclusivo', desc: 'Todos os leads pra 1 agente' },
  { v: 'sequential', label: '📊 Sequencial', desc: 'Próximos X pro A, depois Y pro B…' },
  { v: 'random', label: '🎲 Aleatório', desc: 'Sorteia entre os escolhidos' },
  { v: 'roundrobin', label: '♻️ Round-robin', desc: 'Alterna 1 a 1 entre os escolhidos' },
]

export function LeadRoutingCard() {
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [routing, setRouting] = useState<Routing>({ mode: 'normal' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const sb = createClient()
    // Agentes vêm de um endpoint server-side (bypassa o RLS de buyers, que só deixa
    // cada usuário ler o próprio registro). Settings é legível via client normalmente.
    const [agentsRes, lr] = await Promise.all([
      fetch('/api/admin/agents').then(r => r.json()).catch(() => ({ agents: [] })),
      sb.from('settings').select('value').eq('key', 'lead_routing').maybeSingle(),
    ])
    setBuyers(agentsRes.agents || [])
    if (lr.data?.value) setRouting(lr.data.value as Routing)
    setLoaded(true)
  }

  async function save() {
    setSaving(true)
    const sb = createClient()
    await sb.from('settings').upsert({ key: 'lead_routing', value: routing as any, updated_at: new Date().toISOString() })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  const nameOf = (email: string) => buyers.find(b => b.email === email)?.name || email
  const set = (patch: Partial<Routing>) => setRouting(r => ({ ...r, ...patch }))

  function togglePool(email: string) {
    const pool = routing.pool_emails || []
    set({ pool_emails: pool.includes(email) ? pool.filter(e => e !== email) : [...pool, email] })
  }
  function addStep() {
    set({ steps: [...(routing.steps || []), { email: buyers[0]?.email || '', limit: 10, delivered: 0 }] })
  }
  function updateStep(i: number, patch: Partial<Step>) {
    const steps = [...(routing.steps || [])]
    steps[i] = { ...steps[i], ...patch }
    set({ steps })
  }
  function removeStep(i: number) {
    set({ steps: (routing.steps || []).filter((_, idx) => idx !== i) })
  }

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
      <h2 className="font-bold text-gray-900 mb-1">🧭 Roteamento de Leads</h2>
      <p className="text-xs text-gray-400 mb-4">Para onde vão os próximos leads que chegarem do Meta</p>

      {/* Seletor de modo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
        {MODES.map(m => {
          const active = routing.mode === m.v
          return (
            <button key={m.v} onClick={() => set({ mode: m.v })}
              className="text-left p-3 rounded-xl border transition-all"
              style={{ borderColor: active ? '#6366f1' : '#e8ecf4', background: active ? '#eef2ff' : '#fff' }}>
              <p className="text-sm font-bold" style={{ color: active ? '#4338ca' : '#1a1a2e' }}>{m.label}</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>{m.desc}</p>
            </button>
          )
        })}
      </div>

      {/* Config por modo */}
      {routing.mode === 'normal' && (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
          Distribuição padrão: cada lead vai pro agente elegível (licença no estado) com mais créditos.
        </p>
      )}

      {routing.mode === 'exclusive' && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Agente que recebe tudo</label>
          <select value={routing.exclusive_email || ''} onChange={e => set({ exclusive_email: e.target.value })} className={`w-full ${inputCls}`}>
            <option value="">— escolha —</option>
            {buyers.map(b => <option key={b.id} value={b.email}>{b.name} ({b.email})</option>)}
          </select>
        </div>
      )}

      {(routing.mode === 'random' || routing.mode === 'roundrobin') && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Agentes no rodízio</label>
          <div className="space-y-1.5 max-h-56 overflow-auto">
            {buyers.map(b => (
              <label key={b.id} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={(routing.pool_emails || []).includes(b.email)} onChange={() => togglePool(b.email)}
                  className="w-4 h-4 accent-indigo-500" />
                <span className="text-sm text-gray-800">{b.name}</span>
                <span className="text-[11px] text-gray-400">{b.email}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {routing.mode === 'sequential' && (
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-gray-700">Etapas (em ordem)</label>
          {(routing.steps || []).map((s, i) => {
            const done = (s.delivered || 0) >= (s.limit || 0)
            return (
              <div key={i} className="flex items-center gap-2 p-3 rounded-xl" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
                <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                <select value={s.email} onChange={e => updateStep(i, { email: e.target.value })} className={inputCls} style={{ flex: 1 }}>
                  {buyers.map(b => <option key={b.id} value={b.email}>{b.name}</option>)}
                </select>
                <input type="number" min={1} value={s.limit} onChange={e => updateStep(i, { limit: parseInt(e.target.value) || 0 })}
                  className={inputCls} style={{ width: 70 }} title="quantos leads" />
                <span className="text-[11px] font-bold px-2 py-1 rounded" style={{ background: done ? '#dcfce7' : '#fff7ed', color: done ? '#15803d' : '#ea580c' }}>
                  {s.delivered || 0}/{s.limit}
                </span>
                <button onClick={() => removeStep(i)} className="text-gray-400 hover:text-red-500 text-lg leading-none px-1">×</button>
              </div>
            )
          })}
          <button onClick={addStep} className="text-[13px] font-bold px-3 py-1.5 rounded-lg" style={{ background: '#eef2ff', color: '#6366f1' }}>
            + Adicionar etapa
          </button>

          <div className="pt-3 mt-2 border-t border-gray-100">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Quando as etapas terminarem</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <select value={routing.fallback_mode || 'normal'} onChange={e => set({ fallback_mode: e.target.value as any })} className={inputCls}>
                <option value="normal">Voltar ao Normal (créditos/estado)</option>
                <option value="exclusive">Exclusivo pra um agente</option>
              </select>
              {routing.fallback_mode === 'exclusive' && (
                <select value={routing.fallback_email || ''} onChange={e => set({ fallback_email: e.target.value })} className={inputCls} style={{ flex: 1 }}>
                  <option value="">— escolha —</option>
                  {buyers.map(b => <option key={b.id} value={b.email}>{b.name}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mt-5">
        <button onClick={save} disabled={saving || !loaded}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Salvando…' : 'Salvar Roteamento'}
        </button>
        {saved && <span className="text-sm font-medium text-green-600">✅ Salvo! Vale no próximo lead.</span>}
      </div>
    </div>
  )
}
