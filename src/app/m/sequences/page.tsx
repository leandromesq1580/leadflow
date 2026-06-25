'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { Toggle } from '@/components/mobile/toggle'
import { useStages } from '@/components/mobile/use-stages'

interface Step { id?: string; delay_hours: number; template_id: string | null; custom_body: string | null; step_type: 'send_template' | 'wait' | 'notify_agent' }
interface Sequence { id?: string; name: string; description?: string | null; enabled?: boolean; trigger_stage_id?: string | null; sequence_steps: Step[] }
interface Template { id: string; name: string }

const PRESETS = [0, 1, 6, 24, 48, 72, 168]

export default function MobileSequences() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const router = useRouter()

  const [buyerId, setBuyerId] = useState<string | null>(null)
  const [list, setList] = useState<Sequence[] | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Sequence | null>(null)
  const [busy, setBusy] = useState(false)
  const { pipelines } = useStages(buyerId)

  const delayLabel = (h: number) => (h === 0 ? L('imediato', 'now', 'inmediato') : h < 24 ? `${h}h` : `${h / 24}d`)
  const stepTypeLabel = (s: Step) => s.step_type === 'wait' ? L('Esperar', 'Wait', 'Esperar') : s.step_type === 'notify_agent' ? L('Notificar', 'Notify', 'Notificar') : (templates.find(t => t.id === s.template_id)?.name || L('Template', 'Template', 'Plantilla'))

  const reload = (bid: string) => fetch(`/api/sequences?buyer_id=${bid}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setList(d.sequences || []) }).catch(() => {})

  useEffect(() => {
    fetch('/api/m/team-context', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d?.buyer_id) { setList([]); return }
      setBuyerId(d.buyer_id); reload(d.buyer_id)
      fetch(`/api/templates?buyer_id=${d.buyer_id}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => { if (j) setTemplates(j.templates || []) }).catch(() => {})
    }).catch(() => setList([]))
  }, [])

  async function toggle(s: Sequence) {
    if (!s.id) return
    setList(prev => (prev || []).map(x => x.id === s.id ? { ...x, enabled: !x.enabled } : x))
    try { await fetch(`/api/sequences/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !s.enabled }) }) } catch {}
  }

  async function save() {
    if (!editing || busy || !editing.name.trim() || editing.sequence_steps.length === 0) return
    setBusy(true)
    const steps = editing.sequence_steps.map(s => ({ delay_hours: Number(s.delay_hours) || 0, step_type: s.step_type, template_id: s.step_type === 'send_template' ? (s.template_id || null) : null, custom_body: null }))
    const body: any = { name: editing.name, description: editing.description || null, trigger_stage_id: editing.trigger_stage_id || null, steps }
    try {
      if (editing.id) await fetch(`/api/sequences/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      else await fetch('/api/sequences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buyer_id: buyerId, ...body }) })
      if (buyerId) await reload(buyerId)
      setEditing(null)
    } catch {}
    setBusy(false)
  }

  async function del(s: Sequence) {
    if (!s.id || !confirm(L('Excluir esta sequência? Inscrições ativas serão canceladas.', 'Delete this sequence?', '¿Eliminar?'))) return
    try { await fetch(`/api/sequences/${s.id}`, { method: 'DELETE' }); if (buyerId) reload(buyerId) } catch {}
  }

  const setStep = (i: number, patch: Partial<Step>) => setEditing(e => e ? { ...e, sequence_steps: e.sequence_steps.map((s, j) => j === i ? { ...s, ...patch } : s) } : e)
  const selStyle = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--m-text)', borderRadius: 11, height: 42, padding: '0 11px', fontSize: 13, outline: 'none', colorScheme: 'dark' } as React.CSSProperties
  const newSeq = (): Sequence => ({ name: '', description: '', trigger_stage_id: '', sequence_steps: [{ delay_hours: 24, template_id: null, custom_body: null, step_type: 'send_template' }] })

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 6, display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
        <button onClick={() => router.push('/m/mais')} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="arrowLeft" size={24} /></button>
        <p style={{ margin: 0, flex: 1, fontSize: 20, fontWeight: 800 }}>Sequences</p>
        <button onClick={() => setEditing(newSeq())} className="m-tap" style={{ background: 'none', border: 'none', color: '#a5b4fc', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="plus" size={24} /></button>
      </div>

      <div className="m-pad" style={{ paddingTop: 6 }}>
        {!list && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="m-spin" /></div>}
        {list && list.length === 0 && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40, fontSize: 14 }}>{L('Nenhuma sequência. Toque em + pra criar.', 'No sequences. Tap + to create.', 'Sin secuencias.')}</p>}

        {(list || []).map(s => (
          <div key={s.id} className="m-card" style={{ padding: 14, marginBottom: 11, opacity: s.enabled ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{s.name}</span>
              <Toggle on={!!s.enabled} onClick={() => toggle(s)} />
            </div>
            {s.description && <p className="m-muted" style={{ margin: '0 0 9px', fontSize: 12 }}>{s.description}</p>}
            <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 4, marginBottom: 11 }}>
              {(s.sequence_steps || []).slice().sort((a, b) => (a as any).step_order - (b as any).step_order).map((st, i) => (
                <div key={i} style={{ flexShrink: 0, padding: '7px 11px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, whiteSpace: 'nowrap' }}>
                  <span className="m-faint">{delayLabel(st.delay_hours)}</span> · {stepTypeLabel(st)}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditing({ ...s, description: s.description || '', trigger_stage_id: s.trigger_stage_id || '' })} className="m-tap" style={{ flex: 1, height: 38, borderRadius: 10, background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{L('Editar', 'Edit', 'Editar')}</button>
              <button onClick={() => del(s)} className="m-tap" style={{ width: 44, height: 38, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><MIcon name="x" size={16} /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="m-sheet-ov" onClick={() => setEditing(null)}>
          <div className="m-sheet" onClick={e => e.stopPropagation()} style={{ padding: '8px 20px calc(env(safe-area-inset-bottom) + 18px)' }}>
            <div className="m-sheet-grab" style={{ marginLeft: 'auto', marginRight: 'auto' }} />
            <p style={{ margin: '2px 0 12px', fontSize: 15, fontWeight: 700 }}>{editing.id ? L('Editar sequência', 'Edit sequence', 'Editar') : L('Nova sequência', 'New sequence', 'Nueva')}</p>
            <input className="m-input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder={L('Nome', 'Name', 'Nombre')} style={{ marginBottom: 12 }} />
            <input className="m-input" value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} placeholder={L('Descrição (opcional)', 'Description (optional)', 'Descripción')} style={{ marginBottom: 12 }} />
            <p className="m-muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 6px' }}>{L('Gatilho (estágio)', 'Trigger (stage)', 'Disparador')}</p>
            <select value={editing.trigger_stage_id || ''} onChange={e => setEditing({ ...editing, trigger_stage_id: e.target.value })} style={{ ...selStyle, height: 46, marginBottom: 16 }}>
              <option value="">{L('Sem gatilho', 'No trigger', 'Sin disparador')}</option>
              {pipelines.map(p => <optgroup key={p.id} label={p.name}>{p.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
            </select>

            <p className="m-muted" style={{ fontSize: 12, fontWeight: 700, margin: '0 0 10px' }}>{L('Passos', 'Steps', 'Pasos')}</p>
            {editing.sequence_steps.map((st, i) => (
              <div key={i} className="m-card" style={{ padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }} className="m-muted">{L('Passo', 'Step', 'Paso')} {i + 1}</span>
                  <button onClick={() => setEditing(e => e ? { ...e, sequence_steps: e.sequence_steps.filter((_, j) => j !== i) } : e)} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-faint)', cursor: 'pointer', display: 'flex', padding: 2 }}><MIcon name="x" size={15} /></button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}>
                  <div style={{ flex: 1 }}>
                    <p className="m-faint" style={{ fontSize: 11, margin: '0 0 4px' }}>{L('Atraso (h)', 'Delay (h)', 'Retraso (h)')}</p>
                    <input type="number" value={st.delay_hours} onChange={e => setStep(i, { delay_hours: Number(e.target.value) })} style={selStyle as any} />
                  </div>
                  <div style={{ flex: 1.3 }}>
                    <p className="m-faint" style={{ fontSize: 11, margin: '0 0 4px' }}>{L('Tipo', 'Type', 'Tipo')}</p>
                    <select value={st.step_type} onChange={e => setStep(i, { step_type: e.target.value as any })} style={selStyle}>
                      <option value="send_template">{L('Enviar template', 'Send template', 'Enviar plantilla')}</option>
                      <option value="wait">{L('Esperar', 'Wait', 'Esperar')}</option>
                      <option value="notify_agent">{L('Notificar agente', 'Notify agent', 'Notificar')}</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: st.step_type === 'send_template' ? 9 : 0 }}>
                  {PRESETS.map(p => <span key={p} className={`m-chip m-tap${st.delay_hours === p ? ' on' : ''}`} onClick={() => setStep(i, { delay_hours: p })} style={{ padding: '4px 9px', fontSize: 11 }}>{delayLabel(p)}</span>)}
                </div>
                {st.step_type === 'send_template' && (
                  <select value={st.template_id || ''} onChange={e => setStep(i, { template_id: e.target.value })} style={selStyle}>
                    <option value="">{L('Selecione o template', 'Select template', 'Selecciona')}</option>{templates.map(tp => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
                  </select>
                )}
              </div>
            ))}
            <button onClick={() => setEditing(e => e ? { ...e, sequence_steps: [...e.sequence_steps, { delay_hours: 24, template_id: null, custom_body: null, step_type: 'send_template' }] } : e)} className="m-tap" style={{ width: '100%', marginBottom: 16, background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.18)', color: '#a5b4fc', borderRadius: 12, height: 42, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><MIcon name="plus" size={16} />{L('Adicionar passo', 'Add step', 'Añadir paso')}</button>

            <button onClick={save} disabled={busy || !editing.name.trim() || editing.sequence_steps.length === 0} className="m-tap" style={{ width: '100%', height: 48, borderRadius: 14, background: 'var(--m-grad)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: busy || !editing.name.trim() || editing.sequence_steps.length === 0 ? 0.5 : 1 }}>{busy ? L('Salvando…', 'Saving…', 'Guardando…') : L('Salvar', 'Save', 'Guardar')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
