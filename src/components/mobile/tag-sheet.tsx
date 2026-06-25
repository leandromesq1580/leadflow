'use client'

import { useEffect, useState } from 'react'
import { MIcon } from './icons'

interface Tag { id: string; name: string; color: string }
const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#64748b']

export function TagSheet({
  leadId, buyerId, attachedIds, locale, onClose, onChange,
}: {
  leadId: string
  buyerId: string | null
  attachedIds: string[]
  locale?: string
  onClose: () => void
  onChange: () => void
}) {
  const [catalog, setCatalog] = useState<Tag[]>([])
  const [attached, setAttached] = useState<Set<string>>(new Set(attachedIds))
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PALETTE[0])
  const [busy, setBusy] = useState(false)
  const L = (pt: string, en: string, es: string) => (locale === 'en' ? en : locale === 'es' ? es : pt)

  useEffect(() => {
    if (!buyerId) return
    fetch(`/api/tags?buyer_id=${buyerId}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setCatalog(d.tags || []) }).catch(() => {})
  }, [buyerId])

  async function toggle(tag: Tag) {
    const has = attached.has(tag.id)
    const next = new Set(attached)
    has ? next.delete(tag.id) : next.add(tag.id)
    setAttached(next)
    try {
      if (has) await fetch(`/api/leads/${leadId}/tags?tag_id=${tag.id}`, { method: 'DELETE' })
      else await fetch(`/api/leads/${leadId}/tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_id: tag.id }) })
      onChange()
    } catch {}
  }

  async function create() {
    const name = newName.trim()
    if (!name || busy || !buyerId) return
    setBusy(true)
    try {
      const r = await fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buyer_id: buyerId, name, color: newColor }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.tag) {
        setCatalog(prev => [...prev, d.tag])
        setNewName('')
        await fetch(`/api/leads/${leadId}/tags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_id: d.tag.id }) })
        setAttached(prev => new Set(prev).add(d.tag.id))
        onChange()
      }
    } catch {}
    setBusy(false)
  }

  return (
    <div className="m-sheet-ov" onClick={onClose}>
      <div className="m-sheet" onClick={e => e.stopPropagation()} style={{ padding: '8px 20px calc(env(safe-area-inset-bottom) + 18px)' }}>
        <div className="m-sheet-grab" style={{ marginLeft: 'auto', marginRight: 'auto' }} />
        <p style={{ margin: '2px 0 12px', fontSize: 15, fontWeight: 700 }}>Tags</p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {catalog.length === 0 && <p className="m-muted" style={{ fontSize: 13 }}>{L('Nenhuma tag ainda. Crie a primeira abaixo.', 'No tags yet. Create one below.', 'Sin tags. Crea una abajo.')}</p>}
          {catalog.map(tg => {
            const on = attached.has(tg.id)
            return (
              <span key={tg.id} className="m-tap" onClick={() => toggle(tg)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 999, cursor: 'pointer', background: on ? `${tg.color}26` : 'rgba(255,255,255,0.04)', color: on ? tg.color : 'var(--m-muted)', border: `1px solid ${on ? tg.color + '66' : 'rgba(255,255,255,0.1)'}` }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: tg.color }} />
                {tg.name}
                {on && <MIcon name="check" size={13} />}
              </span>
            )
          })}
        </div>

        <p className="m-muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 8px' }}>{L('Criar nova', 'Create new', 'Crear nueva')}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={L('Nome da tag', 'Tag name', 'Nombre')} className="m-input" style={{ flex: 1, height: 44 }} />
          <button onClick={create} disabled={busy || !newName.trim()} className="m-tap" style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--m-grad)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, opacity: busy || !newName.trim() ? 0.5 : 1 }}><MIcon name="plus" size={18} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {PALETTE.map(c => (
            <span key={c} className="m-tap" onClick={() => setNewColor(c)} style={{ width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', border: newColor === c ? '2px solid #fff' : '2px solid transparent', boxShadow: newColor === c ? `0 0 0 2px ${c}` : 'none' }} />
          ))}
        </div>

        <button onClick={onClose} className="m-tap" style={{ width: '100%', marginTop: 18, background: 'rgba(255,255,255,0.06)', color: 'var(--m-text)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, height: 46, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{L('Pronto', 'Done', 'Listo')}</button>
      </div>
    </div>
  )
}
