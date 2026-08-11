'use client'

import { useState, useEffect } from 'react'
import { StageSelect, rotuloDoEstagio, todosOsEstagios, type PipelineOpt } from '@/components/stage-select'
import { useT } from '@/lib/i18n-client'

interface Automation {
  id: string
  name: string
  trigger_type: 'stage_entered' | 'stage_stale' | 'no_response' | 'meeting_before' | 'event_before'
  trigger_config: { stage_id?: string; hours?: number }
  action_type: 'send_template' | 'move_stage' | 'notify_agent'
  action_config: { template_id?: string; target_stage_id?: string }
  enabled: boolean
}

interface Template {
  id: string; name: string; type: 'whatsapp' | 'email'
}

interface Stage { id: string; name: string; pipelineId: string; pipelineName: string }

type LFn = (pt: string, en: string, es: string) => string

const TRIGGER_LABELS = (L: LFn): Record<string, string> => ({
  stage_entered: L('Lead entrou em estágio', 'Lead entered a stage', 'El lead entró a una etapa'),
  stage_stale: L('Lead parado em estágio', 'Lead stuck in a stage', 'Lead parado en una etapa'),
  no_response: L('Sem resposta há N horas', 'No response for N hours', 'Sin respuesta por N horas'),
  meeting_before: L('Antes de uma reunião', 'Before a meeting', 'Antes de una reunión'),
  event_before: L('Antes de um evento da agenda', 'Before a calendar event', 'Antes de un evento de la agenda'),
})

const ACTION_LABELS = (L: LFn): Record<string, string> => ({
  send_template: L('Enviar template', 'Send template', 'Enviar template'),
  move_stage: L('Mover para outro estágio', 'Move to another stage', 'Mover a otra etapa'),
  notify_agent: L('Notificar agente', 'Notify agent', 'Notificar al agente'),
})

export default function AutomationsPage() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [buyerId, setBuyerId] = useState('')
  const [automations, setAutomations] = useState<Automation[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [pipelines, setPipelines] = useState<PipelineOpt[]>([])
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<Automation | null>(null)
  const [loading, setLoading] = useState(true)

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
      const buyer = await r.json()
      setBuyerId(buyer.id)
      await reload(buyer.id)
    }
    setLoading(false)
  }

  async function reload(bid: string) {
    const [autoRes, tmplRes, pipeRes] = await Promise.all([
      fetch(`/api/automations?buyer_id=${bid}`).then(r => r.json()),
      fetch(`/api/templates?buyer_id=${bid}`).then(r => r.json()),
      fetch(`/api/pipelines?buyer_id=${bid}`).then(r => r.ok ? r.json() : { pipelines: [] }),
    ])
    setAutomations(autoRes.automations || [])
    setTemplates(tmplRes.templates || [])
    // TODAS as pipelines entram. Quem tem "Vendas" e "Pós Vendas" precisa automatizar
    // as duas — antes só a padrão aparecia e o resto do funil ficava inalcançável.
    // (o motor já dispara em qualquer pipeline: automation-engine filtra por buyer, não por pipeline)
    const pipes: PipelineOpt[] = pipeRes.pipelines || []
    setPipelines(pipes)
    setStages(todosOsEstagios(pipes))
  }

  async function toggle(a: Automation) {
    await fetch(`/api/automations/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !a.enabled }),
    })
    await reload(buyerId)
  }

  async function remove(id: string) {
    if (!confirm(L('Deletar automação?', 'Delete automation?', '¿Eliminar la automatización?'))) return
    await fetch(`/api/automations/${id}`, { method: 'DELETE' })
    await reload(buyerId)
  }

  function describe(a: Automation) {
    const triggerTxt = TRIGGER_LABELS(L)[a.trigger_type]
    const stage = stages.find(s => s.id === a.trigger_config.stage_id)
    const tpl = templates.find(t => t.id === a.action_config.template_id)
    const targetStage = stages.find(s => s.id === a.action_config.target_stage_id)
    // com mais de um funil o nome sozinho é ambíguo → "Pós Vendas · Approved"
    const rotulo = (id?: string) => rotuloDoEstagio(pipelines, id, '')

    let trigger = triggerTxt
    if (a.trigger_type === 'stage_entered' && stage) trigger = `${L('Ao entrar em', 'When entering', 'Al entrar en')} "${rotulo(stage.id)}"`
    if (a.trigger_type === 'stage_stale' && stage) trigger = L(`Parado em "${rotulo(stage.id)}" há ${a.trigger_config.hours || 24}h`, `Stuck in "${rotulo(stage.id)}" for ${a.trigger_config.hours || 24}h`, `Parado en "${rotulo(stage.id)}" por ${a.trigger_config.hours || 24}h`)
    if (a.trigger_type === 'no_response') trigger = L(`Sem resposta há ${a.trigger_config.hours || 48}h`, `No response for ${a.trigger_config.hours || 48}h`, `Sin respuesta por ${a.trigger_config.hours || 48}h`)
    if (a.trigger_type === 'meeting_before') trigger = L(`${a.trigger_config.hours || 1}h antes da reunião`, `${a.trigger_config.hours || 1}h before the meeting`, `${a.trigger_config.hours || 1}h antes de la reunión`)
    if (a.trigger_type === 'event_before') trigger = L(`${a.trigger_config.hours || 1}h antes do evento da agenda`, `${a.trigger_config.hours || 1}h before the calendar event`, `${a.trigger_config.hours || 1}h antes del evento de la agenda`)

    let action = ACTION_LABELS(L)[a.action_type]
    if (a.action_type === 'send_template' && tpl) action = `${L('Enviar', 'Send', 'Enviar')} ${tpl.type === 'whatsapp' ? '💬' : '📧'} "${tpl.name}"`
    if (a.action_type === 'move_stage' && targetStage) action = `${L('Mover', 'Move', 'Mover')} → "${targetStage.name}"`

    return { trigger, action }
  }

  if (loading) return <div className="p-8 text-[13px]" style={{ color: '#64748b' }}>{L('Carregando...', 'Loading...', 'Cargando...')}</div>

  return (
    <div className="max-w-[1040px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>{L('Automações', 'Automations', 'Automatizaciones')}</h1>
          <p className="text-[14px]" style={{ color: '#64748b' }}>{L('Dispare ações automáticas quando regras forem atendidas', 'Trigger automatic actions when rules are met', 'Dispara acciones automáticas cuando se cumplan las reglas')}</p>
        </div>
        <button onClick={() => { setShowNew(true); setEditing(null) }}
          className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          + {L('Nova automação', 'New automation', 'Nueva automatización')}
        </button>
      </div>

      {automations.length === 0 && !showNew && (
        <div className="rounded-2xl p-8 text-center" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[40px] mb-3">⚡</p>
          <p className="text-[16px] font-bold mb-2" style={{ color: '#1a1a2e' }}>{L('Ainda sem automações', 'No automations yet', 'Aún sin automatizaciones')}</p>
          <p className="text-[13px] mb-4" style={{ color: '#64748b' }}>
            {L('Exemplos: enviar follow-up 24h após lead entrar, alertar quando parado 48h, mover para "perdido" após 7 dias sem resposta.', 'Examples: send a follow-up 24h after a lead enters, alert when stuck for 48h, move to "lost" after 7 days without a response.', 'Ejemplos: enviar un follow-up 24h después de que entre el lead, alertar cuando lleve 48h parado, mover a "perdido" tras 7 días sin respuesta.')}
          </p>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {automations.map(a => {
          const d = describe(a)
          return (
            <div key={a.id} className="rounded-xl p-4 flex items-center gap-4"
              style={{ background: '#fff', border: '1px solid #e8ecf4', opacity: a.enabled ? 1 : 0.5 }}>
              <button onClick={() => toggle(a)}
                className="w-11 h-6 rounded-full relative transition-colors"
                style={{ background: a.enabled ? '#10b981' : '#cbd5e1' }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                  style={{ left: a.enabled ? '22px' : '2px' }} />
              </button>
              <div className="flex-1">
                <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>{a.name}</p>
                <p className="text-[12px]" style={{ color: '#64748b' }}>
                  <span className="font-semibold">{L('Quando:', 'When:', 'Cuándo:')}</span> {d.trigger} · <span className="font-semibold">{L('Ação:', 'Action:', 'Acción:')}</span> {d.action}
                </p>
              </div>
              <button onClick={() => { setEditing(a); setShowNew(true) }}
                className="text-[12px] font-bold" style={{ color: '#6366f1' }}>{L('Editar', 'Edit', 'Editar')}</button>
              <button onClick={() => remove(a.id)}
                className="text-[12px] font-bold" style={{ color: '#ef4444' }}>{L('Deletar', 'Delete', 'Eliminar')}</button>
            </div>
          )
        })}
      </div>

      {showNew && (
        <AutomationForm pipelines={pipelines}
          buyerId={buyerId}
          templates={templates}
          stages={stages}
          editing={editing}
          onClose={() => { setShowNew(false); setEditing(null) }}
          onSaved={() => { setShowNew(false); setEditing(null); reload(buyerId) }}
        />
      )}
    </div>
  )
}

function AutomationForm({ buyerId, templates, stages, pipelines, editing, onClose, onSaved }: {
  buyerId: string
  templates: Template[]
  stages: Stage[]
  pipelines: PipelineOpt[]
  editing: Automation | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [name, setName] = useState(editing?.name || '')
  const [triggerType, setTriggerType] = useState(editing?.trigger_type || 'stage_entered')
  const [triggerStageId, setTriggerStageId] = useState(editing?.trigger_config.stage_id || '')
  const [triggerHours, setTriggerHours] = useState(editing?.trigger_config.hours || 24)
  const [actionType, setActionType] = useState(editing?.action_type || 'send_template')
  const [actionTemplateId, setActionTemplateId] = useState(editing?.action_config.template_id || '')
  const [actionStageId, setActionStageId] = useState(editing?.action_config.target_stage_id || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const payload: any = {
      buyer_id: buyerId,
      name: name.trim(),
      trigger_type: triggerType,
      trigger_config: {
        stage_id: triggerStageId || undefined,
        hours: triggerType !== 'stage_entered' ? Number(triggerHours) : undefined,
      },
      action_type: actionType,
      action_config: {
        template_id: actionType === 'send_template' ? actionTemplateId : undefined,
        target_stage_id: actionType === 'move_stage' ? actionStageId : undefined,
      },
    }
    const url = editing ? `/api/automations/${editing.id}` : '/api/automations'
    const method = editing ? 'PATCH' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    if (r.ok) onSaved()
    else alert(L('Erro ao salvar', 'Error saving', 'Error al guardar'))
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: '#fff' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-[18px] font-extrabold mb-4" style={{ color: '#1a1a2e' }}>{editing ? L('Editar automação', 'Edit automation', 'Editar automatización') : L('Nova automação', 'New automation', 'Nueva automatización')}</h2>

        <label className="block mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{L('Nome', 'Name', 'Nombre')}</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={L('Ex: Follow-up 24h', 'E.g.: Follow-up 24h', 'Ej: Follow-up 24h')}
            className="w-full mt-1 px-3 py-2 rounded-lg text-[13px]"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
        </label>

        <div className="p-3 rounded-lg mb-3" style={{ background: '#eef2ff' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#6366f1' }}>{L('Quando (gatilho)', 'When (trigger)', 'Cuándo (disparador)')}</p>
          <select value={triggerType} onChange={e => setTriggerType(e.target.value as any)}
            className="w-full mb-2 px-3 py-2 rounded-lg text-[13px]" style={{ background: '#fff', border: '1px solid #c7d2fe' }}>
            <option value="stage_entered">{L('Lead entrou em estágio', 'Lead entered a stage', 'El lead entró a una etapa')}</option>
            <option value="stage_stale">{L('Lead parado em estágio há N horas', 'Lead stuck in a stage for N hours', 'Lead parado en una etapa por N horas')}</option>
            <option value="no_response">{L('Lead sem resposta há N horas', 'Lead with no response for N hours', 'Lead sin respuesta por N horas')}</option>
            <option value="meeting_before">{L('N horas antes de uma reunião', 'N hours before a meeting', 'N horas antes de una reunión')}</option>
            <option value="event_before">{L('N horas antes de um evento da agenda', 'N hours before a calendar event', 'N horas antes de un evento de la agenda')}</option>
          </select>

          {(triggerType === 'stage_entered' || triggerType === 'stage_stale') && (
            <StageSelect pipelines={pipelines} value={triggerStageId} onChange={setTriggerStageId}
              placeholder={L('Escolha o estágio...', 'Choose the stage...', 'Elige la etapa...')}
              className="w-full mb-2 px-3 py-2 rounded-lg text-[13px]" style={{ background: '#fff', border: '1px solid #c7d2fe' }} />
          )}

          {(triggerType === 'stage_stale' || triggerType === 'no_response' || triggerType === 'meeting_before' || triggerType === 'event_before') && (
            <input type="number" value={triggerHours} onChange={e => setTriggerHours(Number(e.target.value))}
              placeholder={triggerType === 'meeting_before' ? L('Horas antes da reunião (ex: 1)', 'Hours before the meeting (e.g. 1)', 'Horas antes de la reunión (ej: 1)') : triggerType === 'event_before' ? L('Horas antes do evento (ex: 1)', 'Hours before the event (e.g. 1)', 'Horas antes del evento (ej: 1)') : L('Horas', 'Hours', 'Horas')} min={1}
              className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ background: '#fff', border: '1px solid #c7d2fe' }} />
          )}
        </div>

        {triggerType === 'event_before' && actionType !== 'notify_agent' && (
          <div className="p-3 rounded-lg mb-3 text-[12px]" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
            ⚠️ {L('Evento da agenda normalmente não tem cliente vinculado. Sem cliente, só a ação', 'Calendar events usually have no client linked. Without a client, only the', 'Un evento de la agenda normalmente no tiene cliente vinculado. Sin cliente, solo la acción')}
            <b> {L('"Notificar agente"', '"Notify agent" action', '"Notificar al agente"')}</b> {L('funciona — as outras precisam de alguém pra receber.', 'works — the others need someone to receive them.', 'funciona — las demás necesitan a alguien que las reciba.')}
          </div>
        )}

        <div className="p-3 rounded-lg mb-4" style={{ background: '#ecfdf5' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#10b981' }}>{L('Então (ação)', 'Then (action)', 'Entonces (acción)')}</p>
          <select value={actionType} onChange={e => setActionType(e.target.value as any)}
            className="w-full mb-2 px-3 py-2 rounded-lg text-[13px]" style={{ background: '#fff', border: '1px solid #a7f3d0' }}>
            <option value="send_template">{L('Enviar template (WhatsApp/Email)', 'Send template (WhatsApp/Email)', 'Enviar template (WhatsApp/Email)')}</option>
            <option value="move_stage">{L('Mover para outro estágio', 'Move to another stage', 'Mover a otra etapa')}</option>
            <option value="notify_agent">{L('Notificar agente por email', 'Notify agent by email', 'Notificar al agente por email')}</option>
          </select>

          {actionType === 'send_template' && (
            <select value={actionTemplateId} onChange={e => setActionTemplateId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ background: '#fff', border: '1px solid #a7f3d0' }}>
              <option value="">{L('Escolha o template...', 'Choose the template...', 'Elige el template...')}</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.type === 'whatsapp' ? '💬' : '📧'} {t.name}</option>)}
            </select>
          )}

          {actionType === 'move_stage' && (
            <StageSelect pipelines={pipelines} value={actionStageId} onChange={setActionStageId}
              placeholder={L('Escolha o estágio destino...', 'Choose the target stage...', 'Elige la etapa de destino...')}
              className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ background: '#fff', border: '1px solid #a7f3d0' }} />
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold" style={{ color: '#64748b' }}>{L('Cancelar', 'Cancel', 'Cancelar')}</button>
          <button onClick={save} disabled={saving || !name.trim()}
            className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            {saving ? L('Salvando...', 'Saving...', 'Guardando...') : editing ? L('Atualizar', 'Update', 'Actualizar') : L('Criar', 'Create', 'Crear')}
          </button>
        </div>
      </div>
    </div>
  )
}
