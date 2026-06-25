'use client'

import { useState } from 'react'
import { MIcon } from './icons'
import { getInitials } from '@/lib/utils'

interface Member { id: string; name: string }

function avatarBg(name: string) {
  const h = ((name?.charCodeAt(0) || 65) * 37) % 360
  return `linear-gradient(135deg, hsl(${h}, 62%, 52%), hsl(${(h + 40) % 360}, 62%, 46%))`
}

export function AssignSheet({
  leadId, leadName, members, currentMemberId, locale, onClose, onDone,
}: {
  leadId: string
  leadName?: string
  members: Member[]
  currentMemberId?: string | null
  locale?: string
  onClose: () => void
  onDone: (memberId: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const L = (pt: string, en: string, es: string) => (locale === 'en' ? en : locale === 'es' ? es : pt)

  async function choose(memberId: string | null) {
    if (busy) return
    setBusy(true)
    try {
      if (memberId) {
        await fetch('/api/team/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: leadId, member_id: memberId }) })
      } else {
        await fetch(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigned_to_member: null }) })
      }
      onDone(memberId)
    } catch {
      setBusy(false)
      return
    }
    setBusy(false)
    onClose()
  }

  return (
    <div className="m-sheet-ov" onClick={onClose}>
      <div className="m-sheet" onClick={e => e.stopPropagation()}>
        <div className="m-sheet-grab" />
        <p className="m-muted" style={{ padding: '0 20px 8px', fontSize: 13, fontWeight: 700 }}>
          {L('Redirecionar pra', 'Reassign to', 'Redirigir a')}{leadName ? ` · ${leadName}` : ''}
        </p>

        {currentMemberId && (
          <div className="m-sheet-item" onClick={() => choose(null)} style={{ opacity: busy ? 0.5 : 1 }}>
            <div className="m-icb" style={{ background: 'rgba(245,158,11,0.18)', color: '#f59e0b' }}><MIcon name="arrowLeft" size={18} /></div>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#fbbf24' }}>{L('Voltar pra mim', 'Back to me', 'Volver a mí')}</span>
          </div>
        )}

        {members.length === 0 && (
          <p className="m-muted" style={{ padding: '8px 20px 14px', fontSize: 13 }}>{L('Você ainda não tem membros no time.', 'You have no team members yet.', 'Aún no tienes miembros en el equipo.')}</p>
        )}

        {members.map(m => (
          <div key={m.id} className="m-sheet-item" onClick={() => choose(m.id)} style={{ opacity: busy ? 0.5 : 1 }}>
            <div className="m-av" style={{ width: 34, height: 34, fontSize: 12, background: avatarBg(m.name) }}>{getInitials(m.name)}</div>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: m.id === currentMemberId ? '#a5b4fc' : 'var(--m-text)' }}>{m.name}</span>
            {m.id === currentMemberId && <span style={{ color: '#34d399', display: 'flex' }}><MIcon name="check" size={18} /></span>}
          </div>
        ))}

        <div className="m-sheet-item" onClick={onClose} style={{ justifyContent: 'center', paddingTop: 8 }}>
          <span className="m-faint" style={{ fontSize: 13, fontWeight: 600 }}>{L('Cancelar', 'Cancel', 'Cancelar')}</span>
        </div>
      </div>
    </div>
  )
}
