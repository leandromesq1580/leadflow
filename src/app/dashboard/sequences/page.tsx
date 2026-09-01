'use client'

import { useState, useEffect } from 'react'
import { useT } from '@/lib/i18n-client'

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
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
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
        const token = JSON.parse(atob(decodeURIComponent(cookie.substring(cookie.indexOf('=') + 1))))
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
    if (!confirm(L('Excluir sequência? As inscrições ativas serão canceladas.', 'Delete sequence? Active enrollments will be canceled.', '¿Eliminar la secuencia? Las inscripciones activas se cancelarán.'))) return
    await fetch(`/api/sequences/${id}`, { method: 'DELETE' })
    await reload(buyerId)
  }

  if (loading) return <div className="p-8 text-[13px]" style={{ color: 'var(--fg-secondary)' }}>{L('Carregando...', 'Loading...', 'Cargando...')}</div>

  return (
    <div className="max-w-[1040px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: 'var(--fg)' }}>{t.sidebar.sequences}</h1>
          <p className="text-[14px]" style={{ color: 'var(--fg-secondary)' }}>{L('Campanhas de drip com múltiplos passos automatizados', 'Drip campaigns with multiple automated steps', 'Campañas de drip con múltiples pasos automatizados')}</p>
        </div>
        <button onClick={() => { setEditing(null); setShowNew(true) }}
          className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)' }}>
          + {L('Nova sequência', 'New sequence', 'Nueva secuencia')}
        </button>
      </div>

      {sequences.length === 0 && !showNew && (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-[40px] mb-3">🔁</p>
          <p className="text-[16px] font-bold mb-2" style={{ color: 'var(--fg)' }}>{L('Ainda sem sequências', 'No sequences yet', 'Aún no hay secuencias')}</p>
          <p className="text-[13px]" style={{ color: 'var(--fg-secondary)' }}>
            {L('Exemplo: Dia 1 WhatsApp → Dia 3 Email → Dia 7 WhatsApp final. Leads enrollados recebem automaticamente.', 'Example: Day 1 WhatsApp → Day 3 Email → Day 7 final WhatsApp. Enrolled leads receive it automatically.', 'Ejemplo: Día 1 WhatsApp → Día 3 Email → Día 7 WhatsApp final. Los leads inscritos lo reciben automáticamente.')}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {sequences.map(s => (
          <div key={s.id} className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', opacity: s.enabled ? 1 : 0.6 }}>
            <div className="flex items-start gap-3 mb-3">
              <button onClick={() => toggle(s)} className="w-11 h-6 rounded-full relative mt-1" style={{ background: s.enabled ? '#10b981' : '#cbd5e1' }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: s.enabled ? '22px' : '2px' }} />
              </button>
              <div className="flex-1">
                <p className="text-[15px] font-bold" style={{ color: 'var(--fg)' }}>{s.name}</p>
                {s.description && <p className="text-[12px]" style={{ color: 'var(--fg-secondary)' }}>{s.description}</p>}
              </div>
              <button onClick={() => { setEditing(s); setShowNew(true) }} className="text-[12px] font-bold" style={{ color: 'var(--accent)' }}>{L('Editar', 'Edit', 'Editar')}</button>
              <button onClick={() => remove(s.id)} className="text-[12px] font-bold" style={{ color: '#ef4444' }}>{L('Deletar', 'Delete', 'Eliminar')}</button>
            </div>

            <div className="flex items-stretch gap-1 overflow-x-auto">
              {s.sequence_steps.map((step, i) => {
                const tpl = templates.find(t => t.id === step.template_id)
                return (
                  <div key={i} className="flex items-center gap-1 flex-shrink-0">
                    <div className="p-2 rounded-lg min-w-[140px]" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>
                        {L('Passo', 'Step', 'Paso')} {i + 1} · {step.delay_hours === 0 ? L('⚡ imediato', '⚡ immediate', '⚡ inmediato') : step.delay_hours >= 24 ? `+${Math.round(step.delay_hours / 24)}d` : `+${step.delay_hours}h`}
                      </p>
                      <p className="text-[12px] font-bold mt-0.5" style={{ color: 'var(--fg)' }}>
                        {step.step_type === 'wait' ? L('⏳ Esperar', '⏳ Wait', '⏳ Esperar') : step.step_type === 'notify_agent' ? L('🔔 Notificar', '🔔 Notify', '🔔 Notificar') : (tpl ? `${tpl.type === 'whatsapp' ? '💬' : '📧'} ${tpl.name}` : L('💬 Custom', '💬 Custom', '💬 Personalizado'))}
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
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
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
    else alert(L('Erro ao salvar', 'Error saving', 'Error al guardar'))
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm overflow-y-auto p-6" onClick={onClose}>
      <div className="mx-auto max-w-[680px] rounded-2xl p-6" style={{ background: 'var(--bg-card)' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-[18px] font-extrabold mb-4" style={{ color: 'var(--fg)' }}>{editing ? L('Editar sequência', 'Edit sequence', 'Editar secuencia') : L('Nova sequência', 'New sequence', 'Nueva secuencia')}</h2>

        <div className="space-y-3 mb-5">
          <input value={name} onChange={e => setName(e.target.value)} placeholder={L('Nome (ex: Onboarding 14 dias)', 'Name (e.g. 14-day onboarding)', 'Nombre (ej: Onboarding 14 días)')}
            className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }} />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={L('Descrição (opcional)', 'Description (optional)', 'Descripción (opcional)')} rows={2}
            className="w-full px-3 py-2 rounded-lg text-[13px] resize-none" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }} />

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--fg-muted)' }}>
              {L('Estágio gatilho', 'Trigger stage', 'Etapa disparadora')} <span style={{ color: '#c0c8d4', fontWeight: 400 }}>{L('(inscreve o lead automaticamente ao entrar nesse estágio)', '(auto-enrolls the lead when it enters this stage)', '(inscribe al prospecto automáticamente al entrar a esta etapa)')}</span>
            </label>
            <select value={triggerStageId} onChange={e => setTriggerStageId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-[13px] cursor-pointer"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}>
              <option value="">{L('— Sem gatilho (só enrolla manualmente) —', '— No trigger (manual enrollment only) —', '— Sin disparador (solo inscripción manual) —')}</option>
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

        <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--fg-muted)' }}>{L('Passos', 'Steps', 'Pasos')}</p>
        <div className="space-y-2 mb-4">
          {steps.map((step, i) => (
            <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold" style={{ color: 'var(--accent)' }}>{L('Passo', 'Step', 'Paso')} {i + 1}</span>
                <button onClick={() => removeStep(i)} className="ml-auto text-[11px] font-bold" style={{ color: '#ef4444' }}>× {L('Remover', 'Remove', 'Quitar')}</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--fg-muted)' }}>{L('Quando', 'When', 'Cuándo')}</label>
                  <div className="flex gap-1 mt-1">
                    <select
                      value={
                        step.delay_hours === 0 ? '0'
                        : step.delay_hours === 1 ? '1'
                        : step.delay_hours === 6 ? '6'
                        : step.delay_hours === 24 ? '24'
                        : step.delay_hours === 48 ? '48'
                        : step.delay_hours === 72 ? '72'
                        : step.delay_hours === 168 ? '168'
                        : 'custom'
                      }
                      onChange={e => {
                        const v = e.target.value
                        if (v === 'custom') {
                          // Se o valor atual e um preset, sobe pra 12 (nao-preset).
                          // Senao ja eh custom, mantem o valor.
                          const PRESETS = [0, 1, 6, 24, 48, 72, 168]
                          const newVal = PRESETS.includes(step.delay_hours) ? 12 : step.delay_hours
                          updateStep(i, { delay_hours: newVal })
                        } else {
                          updateStep(i, { delay_hours: Number(v) })
                        }
                      }}
                      className="flex-1 px-2 py-1 rounded text-[12px] cursor-pointer"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                      <option value="0">{L('⚡ Imediatamente', '⚡ Immediately', '⚡ Inmediatamente')}</option>
                      <option value="1">{L('+1 hora', '+1 hour', '+1 hora')}</option>
                      <option value="6">{L('+6 horas', '+6 hours', '+6 horas')}</option>
                      <option value="24">{L('+1 dia', '+1 day', '+1 día')}</option>
                      <option value="48">{L('+2 dias', '+2 days', '+2 días')}</option>
                      <option value="72">{L('+3 dias', '+3 days', '+3 días')}</option>
                      <option value="168">{L('+7 dias', '+7 days', '+7 días')}</option>
                      <option value="custom">{L('Custom (horas)', 'Custom (hours)', 'Personalizado (horas)')}</option>
                    </select>
                    {![0, 1, 6, 24, 48, 72, 168].includes(step.delay_hours) && (
                      <input type="number" value={step.delay_hours}
                        onChange={e => updateStep(i, { delay_hours: Number(e.target.value) })}
                        min={0} placeholder="h"
                        className="w-16 px-2 py-1 rounded text-[12px]"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} />
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--fg-muted)' }}>{L('Tipo', 'Type', 'Tipo')}</label>
                  <select value={step.step_type} onChange={e => updateStep(i, { step_type: e.target.value as any })}
                    className="w-full mt-1 px-2 py-1 rounded text-[12px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <option value="send_template">{L('Enviar modelo', 'Send template', 'Enviar plantilla')}</option>
                    <option value="wait">{L('Esperar', 'Wait', 'Esperar')}</option>
                    <option value="notify_agent">{L('Notificar agente', 'Notify agent', 'Notificar al agente')}</option>
                  </select>
                </div>
                {step.step_type === 'send_template' && (
                  <div>
                    <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--fg-muted)' }}>{L('Modelo', 'Template', 'Plantilla')}</label>
                    <select value={step.template_id || ''} onChange={e => updateStep(i, { template_id: e.target.value || null })}
                      className="w-full mt-1 px-2 py-1 rounded text-[12px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                      <option value="">{L('Escolha...', 'Choose...', 'Elige...')}</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.type === 'whatsapp' ? '💬' : '📧'} {t.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          ))}
          <button onClick={addStep} className="w-full py-2 rounded-lg text-[12px] font-bold"
            style={{ background: 'var(--accent-light)', color: 'var(--accent)', border: '1px dashed rgba(139,92,246,0.35)' }}>
            + {L('Adicionar passo', 'Add step', 'Agregar paso')}
          </button>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold" style={{ color: 'var(--fg-secondary)' }}>{L('Cancelar', 'Cancel', 'Cancelar')}</button>
          <button onClick={save} disabled={saving || !name.trim() || steps.length === 0}
            className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)' }}>
            {saving ? L('Salvando...', 'Saving...', 'Guardando...') : editing ? L('Atualizar', 'Update', 'Actualizar') : L('Criar', 'Create', 'Crear')}
          </button>
        </div>
      </div>
    </div>
  )
}
