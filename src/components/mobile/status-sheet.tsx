'use client'

import { useState } from 'react'
import { MIcon } from './icons'

export function StatusSheet({
  leadId, locale, onClose, onDone,
}: {
  leadId: string
  locale?: string
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const L = (pt: string, en: string, es: string) => (locale === 'en' ? en : locale === 'es' ? es : pt)

  const actions: { action: string; icon: string; label: string; color: string }[] = [
    { action: 'contacted', icon: 'check', label: L('Contatado', 'Contacted', 'Contactado'), color: '#34d399' },
    { action: 'no_answer', icon: 'phone', label: L('Não atendeu', 'No answer', 'No contestó'), color: '#fbbf24' },
    { action: 'callback', icon: 'refresh', label: L('Retornar depois', 'Callback', 'Devolver llamada'), color: '#a5b4fc' },
    { action: 'meeting_set', icon: 'calendar', label: L('Reunião marcada', 'Meeting set', 'Reunión fijada'), color: '#8b5cf6' },
    { action: 'converted', icon: 'sparkle', label: L('Convertido / fechou', 'Converted', 'Convertido'), color: '#10b981' },
    { action: 'lost', icon: 'x', label: L('Perdido', 'Lost', 'Perdido'), color: '#f87171' },
  ]

  async function choose(action: string) {
    if (busy) return
    setBusy(true)
    try { await fetch(`/api/leads/${leadId}/activity`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }); onDone() } catch {}
    setBusy(false)
    onClose()
  }

  return (
    <div className="m-sheet-ov" onClick={onClose}>
      <div className="m-sheet" onClick={e => e.stopPropagation()}>
        <div className="m-sheet-grab" />
        <p className="m-muted" style={{ padding: '0 20px 8px', fontSize: 13, fontWeight: 700 }}>{L('Registrar interação', 'Log interaction', 'Registrar interacción')}</p>
        {actions.map(a => (
          <div key={a.action} className="m-sheet-item" onClick={() => choose(a.action)} style={{ opacity: busy ? 0.5 : 1 }}>
            <div className="m-icb" style={{ background: `${a.color}22`, color: a.color }}><MIcon name={a.icon} size={18} /></div>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{a.label}</span>
          </div>
        ))}
        <div className="m-sheet-item" onClick={onClose} style={{ justifyContent: 'center', paddingTop: 8 }}>
          <span className="m-faint" style={{ fontSize: 13, fontWeight: 600 }}>{L('Cancelar', 'Cancel', 'Cancelar')}</span>
        </div>
      </div>
    </div>
  )
}
