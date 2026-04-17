'use client'

import { useState, useEffect } from 'react'

interface Automation {
  id: string
  name: string
  trigger_type: 'stage_entered' | 'stage_stale' | 'no_response'
  trigger_config: { stage_id?: string; hours?: number }
  action_type: 'send_template' | 'move_stage' | 'notify_agent'
  action_config: { template_id?: string; target_stage_id?: string }
  enabled: boolean
}

interface Template {
  id: string; name: string; type: 'whatsapp' | 'email'
}

interface Stage {
  id: string; name: string; order: number
}

const TRIGGER_LABELS: Record<string, string> = {
  stage_entered: 'Lead entrou em estágio',
  stage_stale: 'Lead parado em estágio',
  no_response: 'Sem resposta há N horas',
}

const ACTION_LABELS: Record<string, string> = {
  send_template: 'Enviar template',
  move_stage: 'Mover para outro estágio',
  notify_agent: 'Notificar agente',
}

export default function AutomationsPage() {
  const [buyerId, setBuyerId] = useState('')
  const [automations, setAutomations] = useState<Automation[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<Automation | null>(null)
  const [loading, setLoading] = useState(true)

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
    // Flatten stages from default pipeline (or first)
    const pipelines = pipeRes.pipelines || []
    const defaultPipe = pipelines.find((p: any) => p.is_default) || pipelines[0]
    setStages((defaultPipe?.stages || []).map((s: any) => ({ id: s.id, name: s.name, order: s.position })))
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
    if (!confirm('Deletar automação?')) return
    await fetch(`/api/automations/${id}`, { method: 'DELETE' })
    await reload(buyerId)
  }

  function describe(a: Automation) {
    const triggerTxt = TRIGGER_LABELS[a.trigger_type]
    const stage = stages.find(s => s.id === a.trigger_config.stage_id)
    const tpl = templates.find(t => t.id === a.action_config.template_id)
    const targetStage = stages.find(s => s.id === a.action_config.target_stage_id)

    let trigger = triggerTxt
    if (a.trigger_type === 'stage_entered' && stage) trigger = `Ao entrar em "${stage.name}"`
    if (a.trigger_type === 'stage_stale' && stage) trigger = `Parado em "${stage.name}" há ${a.trigger_config.hours || 24}h`
    if (a.trigger_type === 'no_response') trigger = `Sem resposta há ${a.trigger_config.hours || 48}h`

    let action = ACTION_LABELS[a.action_type]
    if (a.action_type === 'send_template' && tpl) action = `Enviar ${tpl.type === 'whatsapp' ? '💬' : '📧'} "${tpl.name}"`
    if (a.action_type === 'move_stage' && targetStage) action = `Mover → "${targetStage.name}"`

    return { trigger, action }
  }

  if (loading) return <div className="p-8 text-[13px]" style={{ color: '#64748b' }}>Carregando...</div>

  return (
    <div className="max-w-[1040px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Automações</h1>
          <p className="text-[14px]" style={{ color: '#64748b' }}>Dispare ações automáticas quando regras forem atendidas</p>
        </div>
        <button onClick={() => { setShowNew(true); setEditing(null) }}
          className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          + Nova automação
        </button>
      </div>

      {automations.length === 0 && !showNew && (
        <div className="rounded-2xl p-8 text-center" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[40px] mb-3">⚡</p>
          <p className="text-[16px] font-bold mb-2" style={{ color: '#1a1a2e' }}>Ainda sem automações</p>
          <p className="text-[13px] mb-4" style={{ color: '#64748b' }}>
            Exemplos: enviar follow-up 24h após lead entrar, alertar quando parado 48h, mover para "perdido" após 7 dias sem resposta.
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
                  <span className="font-semibold">Quando:</span> {d.trigger} · <span className="font-semibold">Ação:</span> {d.action}
                </p>
              </div>
              <button onClick={() => { setEditing(a); setShowNew(true) }}
                className="text-[12px] font-bold" style={{ color: '#6366f1' }}>Editar</button>
              <button onClick={() => remove(a.id)}
                className="text-[12px] font-bold" style={{ color: '#ef4444' }}>Deletar</button>
            </div>
          )
        })}
      </div>

      {showNew && (
        <AutomationForm
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

function AutomationForm({ buyerId, templates, stages, editing, onClose, onSaved }: {
  buyerId: string
  templates: Template[]
  stages: Stage[]
  editing: Automation | null
  onClose: () => void
  onSaved: () => void
}) {
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
    else alert('Erro ao salvar')
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-h-[90vh] overflow-y-auto rounded-2xl p-6"
        style={{ background: '#fff' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-[18px] font-extrabold mb-4" style={{ color: '#1a1a2e' }}>{editing ? 'Editar' : 'Nova'} automação</h2>

        <label className="block mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Nome</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Follow-up 24h"
            className="w-full mt-1 px-3 py-2 rounded-lg text-[13px]"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
        </label>

        <div className="p-3 rounded-lg mb-3" style={{ background: '#eef2ff' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#6366f1' }}>Quando (gatilho)</p>
          <select value={triggerType} onChange={e => setTriggerType(e.target.value as any)}
            className="w-full mb-2 px-3 py-2 rounded-lg text-[13px]" style={{ background: '#fff', border: '1px solid #c7d2fe' }}>
            <option value="stage_entered">Lead entrou em estágio</option>
            <option value="stage_stale">Lead parado em estágio há N horas</option>
            <option value="no_response">Lead sem resposta há N horas</option>
          </select>

          {(triggerType === 'stage_entered' || triggerType === 'stage_stale') && (
            <select value={triggerStageId} onChange={e => setTriggerStageId(e.target.value)}
              className="w-full mb-2 px-3 py-2 rounded-lg text-[13px]" style={{ background: '#fff', border: '1px solid #c7d2fe' }}>
              <option value="">Escolha o estágio...</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          {(triggerType === 'stage_stale' || triggerType === 'no_response') && (
            <input type="number" value={triggerHours} onChange={e => setTriggerHours(Number(e.target.value))}
              placeholder="Horas" min={1}
              className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ background: '#fff', border: '1px solid #c7d2fe' }} />
          )}
        </div>

        <div className="p-3 rounded-lg mb-4" style={{ background: '#ecfdf5' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#10b981' }}>Então (ação)</p>
          <select value={actionType} onChange={e => setActionType(e.target.value as any)}
            className="w-full mb-2 px-3 py-2 rounded-lg text-[13px]" style={{ background: '#fff', border: '1px solid #a7f3d0' }}>
            <option value="send_template">Enviar template (WhatsApp/Email)</option>
            <option value="move_stage">Mover para outro estágio</option>
            <option value="notify_agent">Notificar agente por email</option>
          </select>

          {actionType === 'send_template' && (
            <select value={actionTemplateId} onChange={e => setActionTemplateId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ background: '#fff', border: '1px solid #a7f3d0' }}>
              <option value="">Escolha o template...</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.type === 'whatsapp' ? '💬' : '📧'} {t.name}</option>)}
            </select>
          )}

          {actionType === 'move_stage' && (
            <select value={actionStageId} onChange={e => setActionStageId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ background: '#fff', border: '1px solid #a7f3d0' }}>
              <option value="">Escolha o estágio destino...</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold" style={{ color: '#64748b' }}>Cancelar</button>
          <button onClick={save} disabled={saving || !name.trim()}
            className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            {saving ? 'Salvando...' : editing ? 'Atualizar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}
