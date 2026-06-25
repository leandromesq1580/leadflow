'use client'

import { useState } from 'react'
import { MIcon } from './icons'

interface Stage { id: string; name: string; color: string; position: number }

export function StageSheet({
  stages, currentStageId, locale, onClose, onPick,
}: {
  stages: Stage[]
  currentStageId: string
  locale?: string
  onClose: () => void
  onPick: (stageId: string) => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  const L = (pt: string, en: string, es: string) => (locale === 'en' ? en : locale === 'es' ? es : pt)

  async function pick(stageId: string) {
    if (busy) return
    if (stageId === currentStageId) { onClose(); return }
    setBusy(true)
    try { await onPick(stageId) } catch {}
    setBusy(false)
    onClose()
  }

  return (
    <div className="m-sheet-ov" onClick={onClose}>
      <div className="m-sheet" onClick={e => e.stopPropagation()}>
        <div className="m-sheet-grab" />
        <p className="m-muted" style={{ padding: '0 20px 8px', fontSize: 13, fontWeight: 700 }}>{L('Mover pra etapa', 'Move to stage', 'Mover a etapa')}</p>
        {stages.map(s => (
          <div key={s.id} className="m-sheet-item" onClick={() => pick(s.id)} style={{ opacity: busy ? 0.5 : 1 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: s.id === currentStageId ? '#a5b4fc' : 'var(--m-text)' }}>{s.name}</span>
            {s.id === currentStageId && <span style={{ color: '#34d399', display: 'flex' }}><MIcon name="check" size={18} /></span>}
          </div>
        ))}
        <div className="m-sheet-item" onClick={onClose} style={{ justifyContent: 'center', paddingTop: 8 }}>
          <span className="m-faint" style={{ fontSize: 13, fontWeight: 600 }}>{L('Cancelar', 'Cancel', 'Cancelar')}</span>
        </div>
      </div>
    </div>
  )
}
