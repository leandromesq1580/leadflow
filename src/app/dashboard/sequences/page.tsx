'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { durationSummary } from '@/lib/ai-sequence-form'
import { AISequenceFields } from '@/components/ai-sequence-fields'
import { SequenceEnrollmentPanel } from '@/components/sequence-enrollment-panel'
import { defaultAIConfig, validAISchedule, type AISequenceConfig } from '@/lib/ai-sequence-config'
import { sequenceJSON, saveSequenceDraft, duplicateSequenceDraft } from '@/lib/sequence-client'
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
  mode?: 'legacy' | 'ai_until_reply'
  ai_config?: AISequenceConfig
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
  const [duplicate, setDuplicate] = useState<ReturnType<typeof duplicateSequenceDraft> | null>(null)

  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const reload = useCallback(async () => {
    const result = await sequenceJSON('/api/sequences')
    setBuyerId(result.buyer_id)
    setSequences(result.sequences)
    setTemplates(result.templates)
    setPipelines(result.pipelines)
  }, [])
  useEffect(() => {
    let active = true
    sequenceJSON('/api/sequences').then(result => {
      if (!active) return
      setBuyerId(result.buyer_id); setSequences(result.sequences); setTemplates(result.templates); setPipelines(result.pipelines)
    }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])

  async function toggle(s: Sequence) {
    setError('')
    try {
      await sequenceJSON(`/api/sequences/${s.id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({enabled:!s.enabled})})
      await reload()
    } catch (e) { setError((e as Error).message) }
  }
  async function remove(id: string) {
    if (!confirm(L('Excluir sequência? As inscrições ativas serão canceladas.', 'Delete sequence? Active enrollments will be canceled.', '¿Eliminar la secuencia? Las inscripciones activas se cancelarán.'))) return
    try { await sequenceJSON(`/api/sequences/${id}`, {method:'DELETE'}); await reload() }
    catch (e) { setError((e as Error).message) }
  }

  if (loading) return <div className="p-8 text-[13px]" style={{ color: 'var(--fg-secondary)' }}>{L('Carregando...', 'Loading...', 'Cargando...')}</div>

  return (
    <div className="max-w-[1040px]">
      {error && <p role="alert" className="text-red-600">{error} <button onClick={() => reload().then(() => setError('')).catch(e => setError(e.message))}>Recarregar</button></p>}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: 'var(--fg)' }}>{t.sidebar.sequences}</h1>
          <p className="text-[14px]" style={{ color: 'var(--fg-secondary)' }}>{L('Sequências de passos ou WhatsApp IA até a primeira resposta', 'Drip campaigns with multiple automated steps', 'Campañas de drip con múltiples pasos automatizados')}</p>
        </div>
        <button onClick={() => { setEditing(null); setDuplicate(null); setShowNew(true) }}
          className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white"
          style={{ background: 'var(--accent)' }}>
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
            <div className="flex flex-wrap items-start gap-3 mb-3">
              <button onClick={() => toggle(s)} className="w-11 h-6 shrink-0 rounded-full relative mt-1" style={{ background: s.enabled ? '#10b981' : '#cbd5e1' }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: s.enabled ? '22px' : '2px' }} />
              </button>
              <div className="min-w-0 flex-1 basis-[60%] sm:basis-0 break-words">
                <p className="text-[15px] font-bold" style={{ color: 'var(--fg)' }}>{s.name}</p>
                {s.description && <p className="text-[12px]" style={{ color: 'var(--fg-secondary)' }}>{s.description}</p>}
              </div>
              <button onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="text-[12px] font-bold">Inscrições</button>
              <button onClick={() => { setEditing(s); setDuplicate(null); setShowNew(true) }} className="text-[12px] font-bold" style={{ color: 'var(--accent)' }}>{L('Editar', 'Edit', 'Editar')}</button>
              <button onClick={() => { setEditing(null); setDuplicate(duplicateSequenceDraft(s, t._locale)); setShowNew(true) }} className="text-[12px] font-bold" style={{ color: 'var(--accent)' }}>{L('Duplicar', 'Duplicate', 'Duplicar')}</button>
              <button onClick={() => remove(s.id)} className="text-[12px] font-bold" style={{ color: '#ef4444' }}>{L('Deletar', 'Delete', 'Eliminar')}</button>
            </div>

            {s.mode === 'ai_until_reply' && <p className="text-sm">IA · {s.ai_config?.goal === 'meeting' ? 'Reunião' : 'Ligação'} · a cada {durationSummary(s.ai_config?.repeat_minutes ?? 1440)} · até responder</p>}
            {expanded === s.id && <SequenceEnrollmentPanel sequenceId={s.id} enabled={s.enabled}/>}
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
        duplicate={duplicate}
        onClose={() => { setShowNew(false); setEditing(null); setDuplicate(null) }}
        onSaved={reload}
        onError={setError}
      />}
    </div>
  )
}

function SequenceForm({ buyerId, templates, pipelines, editing, duplicate, onClose, onSaved, onError }: {
  buyerId: string; templates: Template[]; pipelines: Pipeline[]; editing: Sequence | null
  duplicate: ReturnType<typeof duplicateSequenceDraft> | null
  onClose: () => void; onSaved: () => Promise<void>; onError: (message: string) => void
}) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const seed = editing ?? duplicate
  const [name, setName] = useState(seed?.name || '')
  const [description, setDescription] = useState(seed?.description || '')
  const [triggerStageId, setTriggerStageId] = useState<string>(seed?.trigger_stage_id || '')
  const [steps, setSteps] = useState<Step[]>(seed?.sequence_steps || [
    { delay_hours: 0, template_id: null, custom_body: null, step_type: 'send_template' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'legacy' | 'ai_until_reply'>(seed?.mode || 'legacy')
  const [aiConfig, setAIConfig] = useState<AISequenceConfig>(seed?.ai_config || defaultAIConfig)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const savingRef = useRef(saving)
  useEffect(() => { closeRef.current = onClose; savingRef.current = saving }, [onClose, saving])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLInputElement>('#sequence-name')?.focus()
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !savingRef.current) { event.preventDefault(); closeRef.current() }
      if (event.key !== 'Tab') return
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') || []).filter(element => element.getClientRects().length > 0)
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [])
  const validAI = validAISchedule(aiConfig)

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
    if (savingRef.current || !name.trim() || (mode === 'legacy' && steps.length === 0) || (mode === 'ai_until_reply' && !validAI)) return
    savingRef.current = true; setSaving(true); setError('')
    const payload = { ...(duplicate ? {enabled: false} : {}), buyer_id: buyerId, name: name.trim(), description: description.trim(), trigger_stage_id: triggerStageId || null, mode, ...(mode === 'ai_until_reply' ? {ai_config: aiConfig} : {}), steps: mode === 'ai_until_reply' ? [] : steps }
    const url = editing ? `/api/sequences/${editing.id}` : '/api/sequences'
    try { await saveSequenceDraft(url, payload, onClose, onSaved) }
    catch (e) { const message = (e as Error).message; setError(message); onError(message) }
    finally { savingRef.current = false; setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-6">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="sequence-title" className={`flex max-h-[calc(100dvh-16px)] w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] shadow-2xl sm:max-h-[calc(100dvh-48px)] ${mode === 'ai_until_reply' ? 'max-w-[1080px]' : 'max-w-[760px]'}`}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-6">
          <div><h2 id="sequence-title" className="text-lg font-semibold tracking-tight">{duplicate ? L('Duplicar sequência', 'Duplicate sequence', 'Duplicar secuencia') : editing ? L('Editar sequência', 'Edit sequence', 'Editar secuencia') : L('Nova sequência', 'New sequence', 'Nueva secuencia')}</h2>
            <p className="mt-1 text-xs text-[var(--fg-secondary)]">{mode === 'ai_until_reply' ? 'Um objetivo, mensagens novas, até a primeira resposta.' : L('Organize os próximos contatos com seus leads.', 'Plan the next touchpoints with your leads.', 'Organiza los próximos contactos con tus leads.')}</p></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label={L('Fechar formulário', 'Close form', 'Cerrar formulario')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-lg text-[var(--fg-secondary)] hover:text-[var(--fg)] disabled:opacity-50">×</button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          <div className="mb-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0"><label htmlFor="sequence-name" className="mb-2 block text-sm font-medium">{L('Nome da sequência', 'Sequence name', 'Nombre de la secuencia')}</label>
              <input id="sequence-name" maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder={L('Ex.: Retomada de contato', 'E.g. Reconnect with leads', 'Ej.: Retomar contacto')}
                className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15" /></div>
            <div className="min-w-0"><label htmlFor="sequence-mode" className="mb-2 block text-sm font-medium">Modo</label><select id="sequence-mode" disabled={!!seed} value={mode} onChange={e => setMode(e.target.value as 'legacy' | 'ai_until_reply')} className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm disabled:opacity-60"><option value="legacy">Passos tradicionais</option><option value="ai_until_reply">WhatsApp IA até responder</option></select></div>
          </div>
          <details className="mb-5 rounded-lg border border-[var(--border)] text-sm">
            <summary className="cursor-pointer px-3 py-2.5 font-medium">Inscrição e descrição <span className="ml-1 text-xs font-normal text-[var(--fg-secondary)]">· {triggerStageId ? 'por estágio' : 'inscrição manual'}</span></summary>
            <div className="space-y-3 border-t border-[var(--border)] p-3">
              <label className="block space-y-2 text-sm">{L('Descrição (opcional)', 'Description (optional)', 'Descripción (opcional)')}
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm resize-y" /></label>
              <label className="block space-y-2 text-sm">{L('Estágio gatilho', 'Trigger stage', 'Etapa disparadora')}
                <select value={triggerStageId} onChange={e => setTriggerStageId(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm">
                  <option value="">{L('Sem gatilho · inscrição manual', 'No trigger · manual enrollment', 'Sin disparador · inscripción manual')}</option>
                  {pipelines.map(p => <optgroup key={p.id} label={p.name}>{[...(p.stages || [])].sort((a, b) => a.position - b.position).map(s => <option key={s.id} value={s.id}>{s.name.trim()}</option>)}</optgroup>)}
                </select>
              </label><p className="text-xs text-[var(--fg-secondary)]">Inscreve novos leads ao entrarem no estágio escolhido. Não inscreve leads que já estão nele.</p>
            </div>
          </details>
          {mode === 'ai_until_reply' && <AISequenceFields value={aiConfig} onChange={setAIConfig}/>}

        {mode === 'legacy' && <>
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
                  <select value={step.step_type} onChange={e => updateStep(i, { step_type: e.target.value as Step['step_type'] })}
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

        </>}
        </div>
        <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 sm:px-6">
          {error && <p role="alert" className="mb-3 rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--fg-secondary)]">{duplicate ? L('A cópia será criada desativada, sem contatos inscritos.', 'The copy will be created disabled, with no enrolled contacts.', 'La copia se creará desactivada, sin contactos inscritos.') : mode === 'ai_until_reply' && !editing ? 'Criada desativada. Você decide quando ativar.' : 'Revise as configurações antes de salvar.'}</p>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={onClose} disabled={saving} className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--fg-secondary)] disabled:opacity-50">{L('Cancelar', 'Cancel', 'Cancelar')}</button>
              <button onClick={save} disabled={saving || !name.trim() || (mode === 'legacy' && steps.length === 0) || (mode === 'ai_until_reply' && !validAI)}
                className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? L('Salvando...', 'Saving...', 'Guardando...') : editing ? L('Salvar alterações', 'Save changes', 'Guardar cambios') : L('Criar sequência', 'Create sequence', 'Crear secuencia')}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
