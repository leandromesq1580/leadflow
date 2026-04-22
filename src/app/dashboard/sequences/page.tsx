'use client'

import { useState, useEffect } from 'react'

interface Step {
  id?: string
  delay_hours: number
  template_id: string | null
  custom_body: string | null
  step_type: 'send_template' | 'wait' | 'notify_agent'
}

interface Sequence {
  id: string
  name: string
  description: string | null
  enabled: boolean
  trigger_stage_id?: string | null
  sequence_steps: Step[]
}

interface Template {
  id: string; name: string; type: 'whatsapp' | 'email'
}

interface Stage {
  id: string; name: string; pipeline_id: string; position: number
}
interface Pipeline {
  id: string; name: string; is_default: boolean; stages: Stage[]
}

export default function SequencesPage() {
  const [buyerId, setBuyerId] = useState('')
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Sequence | null>(null)
  const [showNew, setShowNew] = useState(false)

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
      const b = await r.json()
      setBuyerId(b.id)
      await reload(b.id)
    }
    setLoading(false)
  }

  async function reload(bid: string) {
    const [seqRes, tmplRes, pipeRes] = await Promise.all([
      fetch(`/api/sequences?buyer_id=${bid}`).then(r => r.json()),
      fetch(`/api/templates?buyer_id=${bid}`).then(r => r.json()),
      fetch(`/api/pipelines?buyer_id=${bid}`).then(r => r.json()),
    ])
    setSequences(seqRes.sequences || [])
    setTemplates(tmplRes.templates || [])
    setPipelines(pipeRes.pipelines || [])
  }

  async function toggle(s: Sequence) {
    await fetch(`/api/sequences/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !s.enabled }),
    })
    await reload(buyerId)
  }

  async function remove(id: string) {
    if (!confirm('Deletar sequence? Enrollments ativos serão cancelados.')) return
    await fetch(`/api/sequences/${id}`, { method: 'DELETE' })
    await reload(buyerId)
  }

  if (loading) return <div className="p-8 text-[13px]" style={{ color: '#64748b' }}>Carregando...</div>

  return (
    <div className="max-w-[1040px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Sequences</h1>
          <p className="text-[14px]" style={{ color: '#64748b' }}>Campanhas de drip com múltiplos passos automatizados</p>
        </div>
        <button onClick={() => { setEditing(null); setShowNew(true) }}
          className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          + Nova sequence
        </button>
      </div>

      {sequences.length === 0 && !showNew && (
        <div className="rounded-2xl p-8 text-center" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[40px] mb-3">🔁</p>
          <p className="text-[16px] font-bold mb-2" style={{ color: '#1a1a2e' }}>Ainda sem sequences</p>
          <p className="text-[13px]" style={{ color: '#64748b' }}>
            Exemplo: Dia 1 WhatsApp → Dia 3 Email → Dia 7 WhatsApp final. Leads enrollados recebem automaticamente.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {sequences.map(s => (
          <div key={s.id} className="rounded-xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4', opacity: s.enabled ? 1 : 0.6 }}>
            <div className="flex items-start gap-3 mb-3">
              <button onClick={() => toggle(s)} className="w-11 h-6 rounded-full relative mt-1" style={{ background: s.enabled ? '#10b981' : '#cbd5e1' }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: s.enabled ? '22px' : '2px' }} />
              </button>
              <div className="flex-1">
                <p className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>{s.name}</p>
                {s.description && <p className="text-[12px]" style={{ color: '#64748b' }}>{s.description}</p>}
              </div>
              <button onClick={() => { setEditing(s); setShowNew(true) }} className="text-[12px] font-bold" style={{ color: '#6366f1' }}>Editar</button>
              <button onClick={() => remove(s.id)} className="text-[12px] font-bold" style={{ color: '#ef4444' }}>Deletar</button>
            </div>

            <div className="flex items-stretch gap-1 overflow-x-auto">
              {s.sequence_steps.map((step, i) => {
                const tpl = templates.find(t => t.id === step.template_id)
                return (
                  <div key={i} className="flex items-center gap-1 flex-shrink-0">
                    <div className="p-2 rounded-lg min-w-[140px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                        Passo {i + 1} · +{step.delay_hours}h
                      </p>
                      <p className="text-[12px] font-bold mt-0.5" style={{ color: '#1a1a2e' }}>
                        {step.step_type === 'wait' ? '⏳ Esperar' : step.step_type === 'notify_agent' ? '🔔 Notificar' : (tpl ? `${tpl.type === 'whatsapp' ? '💬' : '📧'} ${tpl.name}` : '💬 Custom')}
                      </p>
                    </div>
                    {i < s.sequence_steps.length - 1 && <span style={{ color: '#cbd5e1' }}>→</span>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {showNew && <SequenceForm
        buyerId={buyerId}
        templates={templates}
        pipelines={pipelines}
        editing={editing}
        onClose={() => { setShowNew(false); setEditing(null) }}
        onSaved={() => { setShowNew(false); setEditing(null); reload(buyerId) }}
      />}
    </div>
  )
}

function SequenceForm({ buyerId, templates, pipelines, editing, onClose, onSaved }: {
  buyerId: string; templates: Template[]; pipelines: Pipeline[]; editing: Sequence | null
  onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(editing?.name || '')
  const [description, setDescription] = useState(editing?.description || '')
  const [triggerStageId, setTriggerStageId] = useState<string>(editing?.trigger_stage_id || '')
  const [steps, setSteps] = useState<Step[]>(editing?.sequence_steps || [
    { delay_hours: 0, template_id: null, custom_body: null, step_type: 'send_template' },
  ])
  const [saving, setSaving] = useState(false)

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }
  function addStep() {
    setSteps(prev => [...prev, { delay_hours: 24, template_id: null, custom_body: null, step_type: 'send_template' }])
  }
  function removeStep(i: number) {
    setSteps(prev => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    if (!name.trim() || steps.length === 0) return
    setSaving(true)
    const payload = { buyer_id: buyerId, name: name.trim(), description: description.trim(), trigger_stage_id: triggerStageId || null, steps }
    const url = editing ? `/api/sequences/${editing.id}` : '/api/sequences'
    const method = editing ? 'PATCH' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    if (r.ok) onSaved()
    else alert('Erro ao salvar')
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm overflow-y-auto p-6" onClick={onClose}>
      <div className="mx-auto max-w-[680px] rounded-2xl p-6" style={{ background: '#fff' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-[18px] font-extrabold mb-4" style={{ color: '#1a1a2e' }}>{editing ? 'Editar' : 'Nova'} sequence</h2>

        <div className="space-y-3 mb-5">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome (ex: Onboarding 14 dias)"
            className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (opcional)" rows={2}
            className="w-full px-3 py-2 rounded-lg text-[13px] resize-none" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>
              Estágio gatilho <span style={{ color: '#c0c8d4', fontWeight: 400 }}>(enrolla lead automaticamente ao entrar nesse stage)</span>
            </label>
            <select value={triggerStageId} onChange={e => setTriggerStageId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-[13px] cursor-pointer"
              style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }}>
              <option value="">— Sem gatilho (só enrolla manualmente) —</option>
              {pipelines.map(p => (
                <optgroup key={p.id} label={p.name}>
                  {(p.stages || []).sort((a, b) => a.position - b.position).map(s => (
                    <option key={s.id} value={s.id}>{s.name.trim()}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>Passos</p>
        <div className="space-y-2 mb-4">
          {steps.map((step, i) => (
            <div key={i} className="p-3 rounded-lg" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold" style={{ color: '#6366f1' }}>Passo {i + 1}</span>
                <button onClick={() => removeStep(i)} className="ml-auto text-[11px] font-bold" style={{ color: '#ef4444' }}>× Remover</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase" style={{ color: '#94a3b8' }}>Delay (horas)</label>
                  <input type="number" value={step.delay_hours} onChange={e => updateStep(i, { delay_hours: Number(e.target.value) })}
                    min={0}
                    className="w-full mt-1 px-2 py-1 rounded text-[12px]" style={{ background: '#fff', border: '1px solid #e8ecf4' }} />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase" style={{ color: '#94a3b8' }}>Tipo</label>
                  <select value={step.step_type} onChange={e => updateStep(i, { step_type: e.target.value as any })}
                    className="w-full mt-1 px-2 py-1 rounded text-[12px]" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
                    <option value="send_template">Enviar template</option>
                    <option value="wait">Esperar</option>
                    <option value="notify_agent">Notificar agente</option>
                  </select>
                </div>
                {step.step_type === 'send_template' && (
                  <div>
                    <label className="text-[10px] font-bold uppercase" style={{ color: '#94a3b8' }}>Template</label>
                    <select value={step.template_id || ''} onChange={e => updateStep(i, { template_id: e.target.value || null })}
                      className="w-full mt-1 px-2 py-1 rounded text-[12px]" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
                      <option value="">Escolha...</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.type === 'whatsapp' ? '💬' : '📧'} {t.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          ))}
          <button onClick={addStep} className="w-full py-2 rounded-lg text-[12px] font-bold"
            style={{ background: '#eef2ff', color: '#6366f1', border: '1px dashed #c7d2fe' }}>
            + Adicionar passo
          </button>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold" style={{ color: '#64748b' }}>Cancelar</button>
          <button onClick={save} disabled={saving || !name.trim() || steps.length === 0}
            className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            {saving ? 'Salvando...' : editing ? 'Atualizar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}
