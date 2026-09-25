'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateLeadRouting } from '@/lib/lead-routing-settings'

interface Buyer { id: string; name: string; email: string; is_staff?: boolean }
interface Step { email: string; limit: number; delivered: number }
interface Routing {
  priority_only?: boolean
  mode: 'normal' | 'exclusive' | 'random' | 'roundrobin' | 'sequential'
  exclusive_email?: string | null
  pool_emails?: string[]
  steps?: Step[]
  fallback_mode?: 'normal' | 'exclusive'
  fallback_email?: string | null
  admin_rule?: { admin_emails?: string[]; one_in?: number; daily_quota?: number; daily_max?: number | null }
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
  const [prioritySaving, setPrioritySaving] = useState(false)
  const [priorityError, setPriorityError] = useState('')
  const [savedAdminRule, setSavedAdminRule] = useState<Routing['admin_rule']>()
  const priorityDraft = JSON.stringify(routing.admin_rule || {}) !== JSON.stringify(savedAdminRule || {})
  const customerBuyers = buyers.filter(b => !b.is_staff)

  useEffect(() => { load() }, [])

  async function load() {
    const sb = createClient()
    // Agentes vêm de um endpoint server-side (bypassa o RLS de buyers, que só deixa
    // cada usuário ler o próprio registro). Settings é legível via client normalmente.
    const [agentsRes, lr] = await Promise.all([
      fetch('/api/admin/agents').then(r => r.json()).catch(() => ({ agents: [] })),
      sb.from('settings').select('value').eq('key', 'lead_routing').maybeSingle(),
    ])
    if (lr.error) { setPriorityError('Não foi possível carregar o roteamento. Atualize a página.'); return }
    setBuyers(agentsRes.agents || [])
    if (lr.data?.value) {
      const loadedRouting = lr.data.value as Routing
      setRouting(loadedRouting)
      setSavedAdminRule(loadedRouting.admin_rule)
    }
    setLoaded(true)
  }

  async function togglePriorityOnly() {
    if (!loaded || prioritySaving || saving || (priorityDraft && !routing.priority_only)) return
    setPrioritySaving(true)
    setPriorityError('')
    try {
      const response = await fetch('/api/admin/priority-only', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority_only: routing.priority_only !== true }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Falha ao salvar')
      setRouting(current => ({ ...current, priority_only: result.priority_only,
        // Another tab may have changed the saved selection. Reconcile clean
        // drafts only; edits made before or during this request stay visible.
        admin_rule: JSON.stringify(current.admin_rule || {}) === JSON.stringify(savedAdminRule || {})
          ? result.admin_rule ?? undefined : current.admin_rule,
      }))
      setSavedAdminRule(result.admin_rule ?? undefined)
    } catch (error) {
      setPriorityError(error instanceof Error ? error.message : 'Falha ao salvar')
    } finally { setPrioritySaving(false) }
  }

  async function save() {
    if ((routing.admin_rule?.one_in ?? routing.admin_rule?.daily_quota ?? 0) > 0 && routing.admin_rule?.daily_max === 0 && routing.admin_rule?.admin_emails?.length) {
      if (!confirm('O limite diário está em ZERO. Isso bloqueia TODOS os leads pela regra de prioridade, mesmo com agentes selecionados. Deseja salvar esse bloqueio? Para permitir entregas sem teto diário, clique em Cancelar e depois em “Remover limite diário”.')) return
    }
    setSaving(true)
    try {
      const sb = createClient()
      const value = await updateLeadRouting(sb, current => {
        const freshSteps = (current.steps as Step[] | undefined) || []
        return {
          ...current, ...routing,
          // This form never owns the immediate switch or the queue-order selector.
          priority_only: current.priority_only === true,
          queue_order: current.queue_order,
          steps: routing.steps?.map((step, i) => ({ ...step,
            delivered: freshSteps[i]?.email === step.email
              ? Math.max(step.delivered || 0, freshSteps[i].delivered || 0) : step.delivered,
          })),
        }
      })
      setRouting(value as unknown as Routing)
      setSavedAdminRule((value as unknown as Routing).admin_rule)
    } catch (error) {
      alert('Falha ao salvar o roteamento: ' + (error instanceof Error ? error.message : 'tente novamente'))
      return
    } finally { setSaving(false) }
    setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  const nameOf = (email: string) => buyers.find(b => b.email === email)?.name || email
  const set = (patch: Partial<Routing>) => setRouting(r => ({ ...r, ...patch }))

  function togglePool(email: string) {
    const pool = routing.pool_emails || []
    set({ pool_emails: pool.includes(email) ? pool.filter(e => e !== email) : [...pool, email] })
  }
  function toggleAdmin(email: string) {
    const cur = routing.admin_rule || { admin_emails: [], one_in: 0 }
    const list = cur.admin_emails || []
    set({ admin_rule: { ...cur, admin_emails: list.includes(email) ? list.filter(e => e !== email) : [...list, email] } })
  }
  function setOneIn(n: number) {
    // grava no campo novo (one_in) e zera o antigo (daily_quota) pra não confundir
    set({ admin_rule: { ...(routing.admin_rule || { admin_emails: [] }), one_in: n, daily_quota: undefined } })
  }
  function setDailyMax(v: string) {
    // vazio = sem limite (null); 0 = nenhum lead pro admin hoje; N = teto por dia
    const daily_max = v.trim() === '' ? null : Math.max(0, parseInt(v) || 0)
    set({ admin_rule: { ...(routing.admin_rule || { admin_emails: [] }), daily_max } })
  }
  function addStep() {
    set({ steps: [...(routing.steps || []), { email: customerBuyers[0]?.email || '', limit: 10, delivered: 0 }] })
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
      <p className="text-xs text-indigo-700 bg-indigo-50 rounded-lg p-3 mb-4">{routing.priority_only
        ? 'Somente os prioritários salvos recebem leads automáticos. Funcionários selecionados também precisam de crédito no idioma do lead; cada entrega consome um crédito e respeita licença, horários e teto diário.'
        : 'Funcionários ficam fora da fila e dos roteamentos por crédito. Para direcionar leads a um funcionário, selecione-o explicitamente na Regra do Administrador abaixo; essa entrega não consome créditos.'}</p>

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
            {customerBuyers.map(b => <option key={b.id} value={b.email}>{b.name} ({b.email})</option>)}
          </select>
        </div>
      )}

      {(routing.mode === 'random' || routing.mode === 'roundrobin') && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Agentes no rodízio</label>
          <div className="space-y-1.5 max-h-56 overflow-auto">
            {customerBuyers.map(b => (
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
                  {customerBuyers.map(b => <option key={b.id} value={b.email}>{b.name}</option>)}
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
                  {customerBuyers.map(b => <option key={b.id} value={b.email}>{b.name}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Regra do Administrador — 1 a cada N leads (proporcional), independente do modo acima */}
      <div className="pt-4 mt-4 border-t border-gray-100">
        <label className="block text-sm font-semibold text-gray-700 mb-1">👤 Regra do Administrador</label>
        <div className="p-3 mb-3 rounded-xl border border-indigo-200 bg-indigo-50">
          <button type="button" role="switch" aria-checked={routing.priority_only === true}
            disabled={!loaded || prioritySaving || saving || (priorityDraft && !routing.priority_only)} onClick={togglePriorityOnly}
            className="font-semibold text-sm text-indigo-900 disabled:opacity-50">
            Entregar somente aos prioritários — {prioritySaving ? 'Salvando…' : routing.priority_only ? 'Ligado' : 'Desligado'}
          </button>
          <p className="text-xs text-indigo-800 mt-2">Salva imediatamente. Ligado: todos os leads automáticos do sistema (PT e ES) ficam restritos aos destinatários da prioridade salvos, com crédito do próprio idioma, conta ativa, licença, horário e limite diário. Sem elegível, ficam pendentes; não há fallback. A proporção “1 a cada N” fica suspensa, sem apagar a seleção ou as regras anteriores.</p>
          <p className="text-xs text-indigo-800 mt-1">Salve alterações nos destinatários antes de ligar. Ao desligar, volta o roteamento anterior. Leads históricos, manuais e agendamentos não são reatribuídos.</p>
          {priorityDraft && <p role="status" className="text-sm text-amber-800 mt-2">Regra de prioridade com alterações não salvas (rascunho). A seleção e o limite salvos continuam valendo. Salve o roteamento antes de ligar.</p>}
          {routing.priority_only && !savedAdminRule?.admin_emails?.length && <p role="status" className="text-sm text-amber-800 mt-2">Nenhum prioritário salvo: leads automáticos ficam pendentes.</p>}
          {priorityError && <p role="alert" className="text-sm text-red-700 mt-2">{priorityError}</p>}
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          A cada <b>N leads do sistema</b>, 1 vai pro(s) destinatário(s) (em rodízio), com PRIORIDADE sobre o roteamento abaixo e respeitando a licença de estado. <b>Cliente paga 1 crédito por entrega e para automaticamente quando o saldo líquido chega a zero ou fica negativo.</b> Somente funcionário explicitamente marcado recebe por esta regra sem débito. Ex.: <b>3</b> = a cada 2 leads pros outros, o 3º vai para a prioridade. 0 = desligado. Dá pra combinar com um <b>teto por dia</b>; batido o teto, a vez é pulada. <i>O fallback não respeita o teto — é o último recurso.</i>
        </p>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-sm text-gray-700">A cada</label>
          <input type="number" min={0} value={routing.admin_rule?.one_in ?? routing.admin_rule?.daily_quota ?? 0}
            onChange={e => setOneIn(parseInt(e.target.value) || 0)} className={inputCls} style={{ width: 70 }} />
          <label className="text-sm text-gray-700">leads do sistema, 1 vai pro admin</label>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-sm text-gray-700">Máximo de</label>
          <input type="number" min={0} placeholder="∞" value={routing.admin_rule?.daily_max ?? ''}
            onChange={e => setDailyMax(e.target.value)} className={inputCls} style={{ width: 70 }} />
          <label className="text-sm text-gray-700">leads pro admin <b>por dia</b> (vazio = sem limite · <b>0</b> = bloqueado até alterar)</label>
        </div>
        {routing.admin_rule?.daily_max === 0 && (
          <div role="alert" className="p-3 mb-3 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm">
            <b>{priorityDraft ? 'Rascunho: limite diário em zero.' : 'Prioridade bloqueada: limite diário em zero.'}</b> {priorityDraft ? 'Este bloqueio só passa a valer ao salvar o roteamento.' : 'Os agentes selecionados não receberão nenhum lead por esta regra, nem nos próximos dias, até alterar esse limite.'}
            <button type="button" onClick={() => setDailyMax('')} className="block mt-2 font-bold underline">Remover limite diário</button>
          </div>
        )}
        <label className="block text-[12px] font-semibold text-gray-600 mb-1">Destinatários da prioridade (inclui funcionários)</label>
        <div className="space-y-1.5 max-h-44 overflow-auto">
          {buyers.map(b => (
            <label key={b.id} className="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={(routing.admin_rule?.admin_emails || []).includes(b.email)} onChange={() => toggleAdmin(b.email)}
                className="w-4 h-4 accent-indigo-500" />
              <span className="text-sm text-gray-800">{b.name}</span>
              {b.is_staff && <span className="text-[10px] font-semibold text-indigo-700">Funcionário · só por prioridade</span>}
              <span className="text-[11px] text-gray-400">{b.email}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button onClick={save} disabled={saving || prioritySaving || !loaded}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Salvando…' : 'Salvar Roteamento'}
        </button>
        {saved && <span className="text-sm font-medium text-green-600">✅ Salvo! Vale no próximo lead.</span>}
      </div>
    </div>
  )
}
