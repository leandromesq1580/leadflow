'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { Toggle } from '@/components/mobile/toggle'
import { useStages } from '@/components/mobile/use-stages'
import { StageSelect, rotuloDoEstagio } from '@/components/stage-select'

interface Automation { id?: string; name: string; trigger_type: string; trigger_config: { stage_id?: string; hours?: number }; action_type: string; action_config: { template_id?: string; target_stage_id?: string }; enabled?: boolean }
interface Template { id: string; name: string; type: string }

export default function MobileAutomacoes() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const router = useRouter()

  const [buyerId, setBuyerId] = useState<string | null>(null)
  const [list, setList] = useState<Automation[] | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Automation | null>(null)
  const [busy, setBusy] = useState(false)
  const { pipelines } = useStages(buyerId)

  const TRIGGERS = [
    { v: 'stage_entered', l: L('Lead entrou em estágio', 'Lead entered stage', 'Lead entró en etapa') },
    { v: 'stage_stale', l: L('Lead parado em estágio', 'Lead stale in stage', 'Lead detenido') },
    { v: 'no_response', l: L('Sem resposta há N horas', 'No response for N hours', 'Sin respuesta') },
    { v: 'meeting_before', l: L('Antes de uma reunião', 'Before a meeting', 'Antes de reunión') },
    { v: 'event_before', l: L('Antes de um evento da agenda', 'Before a calendar event', 'Antes de un evento de agenda') },
  ]
  const ACTIONS = [
    { v: 'send_template', l: L('Enviar modelo', 'Send template', 'Enviar plantilla') },
    { v: 'move_stage', l: L('Mover de estágio', 'Move stage', 'Mover etapa') },
    { v: 'notify_agent', l: L('Notificar agente', 'Notify agent', 'Notificar agente') },
  ]
  const tLabel = (v: string) => TRIGGERS.find(x => x.v === v)?.l || v
  const aLabel = (v: string) => ACTIONS.find(x => x.v === v)?.l || v
  const stageName = (id?: string) => rotuloDoEstagio(pipelines, id)
  const tplName = (id?: string) => templates.find(x => x.id === id)?.name || '—'

  const reload = (bid: string) => fetch(`/api/automations?buyer_id=${bid}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setList(d.automations || []) }).catch(() => {})

  useEffect(() => {
    fetch('/api/m/team-context', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d?.buyer_id) { setList([]); return }
      setBuyerId(d.buyer_id); reload(d.buyer_id)
      fetch(`/api/templates?buyer_id=${d.buyer_id}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => { if (j) setTemplates(j.templates || []) }).catch(() => {})
    }).catch(() => setList([]))
  }, [])

  async function toggle(a: Automation) {
    if (!a.id) return
    setList(prev => (prev || []).map(x => x.id === a.id ? { ...x, enabled: !x.enabled } : x))
    try { await fetch(`/api/automations/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !a.enabled }) }) } catch {}
  }

  async function save() {
    if (!editing || busy || !editing.name.trim()) return
    setBusy(true)
    const payload: any = { name: editing.name, trigger_type: editing.trigger_type, action_type: editing.action_type, trigger_config: {}, action_config: {} }
    if (['stage_entered', 'stage_stale'].includes(editing.trigger_type) && editing.trigger_config.stage_id) payload.trigger_config.stage_id = editing.trigger_config.stage_id
    if (editing.trigger_type !== 'stage_entered' && editing.trigger_config.hours) payload.trigger_config.hours = Number(editing.trigger_config.hours)
    if (editing.action_type === 'send_template' && editing.action_config.template_id) payload.action_config.template_id = editing.action_config.template_id
    if (editing.action_type === 'move_stage' && editing.action_config.target_stage_id) payload.action_config.target_stage_id = editing.action_config.target_stage_id
    try {
      if (editing.id) await fetch(`/api/automations/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      else await fetch('/api/automations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buyer_id: buyerId, ...payload }) })
      if (buyerId) await reload(buyerId)
      setEditing(null)
    } catch {}
    setBusy(false)
  }

  async function del(a: Automation) {
    if (!a.id || !confirm(L('Excluir esta automação?', 'Delete this automation?', '¿Eliminar?'))) return
    try { await fetch(`/api/automations/${a.id}`, { method: 'DELETE' }); if (buyerId) reload(buyerId) } catch {}
  }

  const selStyle = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--m-text)', borderRadius: 13, height: 46, padding: '0 12px', fontSize: 14, outline: 'none', colorScheme: 'dark', marginBottom: 12 } as React.CSSProperties
  const newAuto = (): Automation => ({ name: '', trigger_type: 'stage_entered', trigger_config: {}, action_type: 'send_template', action_config: {} })

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 6, display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
        <button onClick={() => router.push('/m/mais')} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="arrowLeft" size={24} /></button>
        <p style={{ margin: 0, flex: 1, fontSize: 20, fontWeight: 800 }}>{L('Automações', 'Automations', 'Automatizaciones')}</p>
        <button onClick={() => setEditing(newAuto())} className="m-tap" style={{ background: 'none', border: 'none', color: '#a5b4fc', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="plus" size={24} /></button>
      </div>

      <div className="m-pad" style={{ paddingTop: 6 }}>
        {!list && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="m-spin" /></div>}
        {list && list.length === 0 && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40, fontSize: 14 }}>{L('Nenhuma automação. Toque em + pra criar.', 'No automations. Tap + to create.', 'Sin automatizaciones.')}</p>}

        {(list || []).map(a => (
          <div key={a.id} className="m-card" style={{ padding: 14, marginBottom: 11, opacity: a.enabled ? 1 : 0.55 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{a.name}</span>
              <Toggle on={!!a.enabled} onClick={() => toggle(a)} />
            </div>
            <p className="m-muted" style={{ margin: '0 0 11px', fontSize: 12, lineHeight: 1.5 }}>
              {L('Quando', 'When', 'Cuando')}: {tLabel(a.trigger_type)}{a.trigger_config?.stage_id ? ` "${stageName(a.trigger_config.stage_id)}"` : ''}{a.trigger_config?.hours ? ` · ${a.trigger_config.hours}h` : ''}<br />
              {L('Então', 'Then', 'Entonces')}: {aLabel(a.action_type)}{a.action_config?.template_id ? ` "${tplName(a.action_config.template_id)}"` : ''}{a.action_config?.target_stage_id ? ` → "${stageName(a.action_config.target_stage_id)}"` : ''}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditing(a)} className="m-tap" style={{ flex: 1, height: 38, borderRadius: 10, background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{L('Editar', 'Edit', 'Editar')}</button>
              <button onClick={() => del(a)} className="m-tap" style={{ width: 44, height: 38, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><MIcon name="x" size={16} /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="m-sheet-ov" onClick={() => setEditing(null)}>
          <div className="m-sheet" onClick={e => e.stopPropagation()} style={{ padding: '8px 20px calc(env(safe-area-inset-bottom) + 18px)' }}>
            <div className="m-sheet-grab" style={{ marginLeft: 'auto', marginRight: 'auto' }} />
            <p style={{ margin: '2px 0 12px', fontSize: 15, fontWeight: 700 }}>{editing.id ? L('Editar automação', 'Edit automation', 'Editar') : L('Nova automação', 'New automation', 'Nueva')}</p>
            <input className="m-input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder={L('Nome', 'Name', 'Nombre')} style={{ marginBottom: 14 }} />

            <p className="m-muted" style={{ fontSize: 12, fontWeight: 700, margin: '0 0 8px' }}>{L('Quando', 'When', 'Cuando')}</p>
            <select value={editing.trigger_type} onChange={e => setEditing({ ...editing, trigger_type: e.target.value, trigger_config: {} })} style={selStyle}>{TRIGGERS.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select>
            {['stage_entered', 'stage_stale'].includes(editing.trigger_type) && (
              <StageSelect pipelines={pipelines} value={editing.trigger_config.stage_id || ''}
                onChange={v => setEditing({ ...editing, trigger_config: { ...editing.trigger_config, stage_id: v } })}
                placeholder={L('Selecione o estágio', 'Select stage', 'Selecciona etapa')} style={selStyle} />
            )}
            {editing.trigger_type !== 'stage_entered' && (
              <input className="m-input" type="number" value={editing.trigger_config.hours ?? ''} onChange={e => setEditing({ ...editing, trigger_config: { ...editing.trigger_config, hours: Number(e.target.value) } })} placeholder={L('Horas', 'Hours', 'Horas')} style={{ marginBottom: 14 }} />
            )}

            <p className="m-muted" style={{ fontSize: 12, fontWeight: 700, margin: '4px 0 8px' }}>{L('Então', 'Then', 'Entonces')}</p>
            <select value={editing.action_type} onChange={e => setEditing({ ...editing, action_type: e.target.value, action_config: {} })} style={selStyle}>{ACTIONS.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}</select>
            {editing.action_type === 'send_template' && (
              <select value={editing.action_config.template_id || ''} onChange={e => setEditing({ ...editing, action_config: { template_id: e.target.value } })} style={selStyle}>
                <option value="">{L('Selecione o modelo', 'Select template', 'Selecciona una plantilla')}</option>{templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            )}
            {editing.action_type === 'move_stage' && (
              <StageSelect pipelines={pipelines} value={editing.action_config.target_stage_id || ''}
                onChange={v => setEditing({ ...editing, action_config: { target_stage_id: v } })}
                placeholder={L('Selecione o estágio', 'Select stage', 'Selecciona etapa')} style={selStyle} />
            )}

            <button onClick={save} disabled={busy || !editing.name.trim()} className="m-tap" style={{ width: '100%', height: 48, borderRadius: 14, background: 'var(--m-grad)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: busy || !editing.name.trim() ? 0.5 : 1, marginTop: 4 }}>{busy ? L('Salvando…', 'Saving…', 'Guardando…') : L('Salvar', 'Save', 'Guardar')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
