'use client'

import { useState, useRef, useLayoutEffect } from 'react'

interface Member {
  id: string
  name: string
}

interface Props {
  leadId: string
  members: Member[]
  currentMemberId?: string | null
  onAssigned?: () => void
  onArchived?: () => void
}

/**
 * Kebab (⋮) menu no canto do card do Kanban.
 * Abre dropdown com lista de team members e botão "voltar pra mim".
 * Usa o mesmo endpoint e padrão visual do AssignButton de /dashboard/leads.
 */
export function CardAssignMenu({ leadId, members, currentMemberId, onAssigned, onArchived }: Props) {
  const [open, setOpen] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [direction, setDirection] = useState<'up' | 'down'>('down')
  const buttonRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const viewportH = window.innerHeight
    // height: header(26) + back(40 if member) + members*36 + separator(8) + archive(36) + cancel(30) + padding(16)
    const dropdownHeight = 120 + members.length * 36 + (currentMemberId ? 40 : 0)
    const spaceBelow = viewportH - rect.bottom
    const spaceAbove = rect.top
    setDirection(spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? 'up' : 'down')
  }, [open, members.length, currentMemberId])

  async function archive() {
    setArchiving(true)
    try {
      await fetch(`/api/leads/${leadId}/archive`, { method: 'POST' })
    } finally {
      setArchiving(false)
      setOpen(false)
      onArchived?.()
    }
  }

  async function assign(memberId: string | null) {
    setAssigning(true)
    try {
      if (memberId) {
        await fetch('/api/team/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_id: leadId, member_id: memberId }),
        })
      } else {
        await fetch(`/api/leads/${leadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigned_to_member: null }),
        })
      }
    } finally {
      setAssigning(false)
      setOpen(false)
      onAssigned?.()
    }
  }

  const currentName = members.find(m => m.id === currentMemberId)?.name
  const positionClass = direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
  const shadowDir = direction === 'up' ? '0 -4px 24px rgba(0,0,0,0.12)' : '0 4px 24px rgba(0,0,0,0.12)'

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}
        aria-label="Atribuir ao time"
        className="flex items-center justify-center rounded-md transition-colors hover:bg-slate-100"
        style={{ width: 24, height: 24, color: currentMemberId ? '#6366f1' : '#94a3b8' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false) }} />
          <div className={`absolute right-0 ${positionClass} z-50 rounded-xl p-2 min-w-[190px]`}
            style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: shadowDir }}>
            <p className="text-[10px] font-bold px-2 py-1 mb-1" style={{ color: '#94a3b8' }}>
              {currentMemberId ? 'Transferir pra:' : 'Atribuir pra:'}
            </p>

            {currentMemberId && (
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); assign(null) }}
                disabled={assigning}
                className="w-full text-left px-3 py-2 rounded-lg text-[12px] font-semibold hover:bg-amber-50 disabled:opacity-50 mb-1"
                style={{ color: '#b45309', borderBottom: '1px solid #f1f5f9' }}>
                ← Voltar pra mim
              </button>
            )}

            {members.length === 0 && (
              <p className="text-[11px] px-3 py-2" style={{ color: '#94a3b8' }}>Nenhum membro no time</p>
            )}

            {members.map(m => (
              <button key={m.id} onClick={(e) => { e.preventDefault(); e.stopPropagation(); assign(m.id) }}
                disabled={assigning}
                className="w-full text-left px-3 py-2 rounded-lg text-[12px] font-semibold hover:bg-indigo-50 disabled:opacity-50"
                style={{ color: m.id === currentMemberId ? '#6366f1' : '#1a1a2e' }}>
                {m.name} {m.id === currentMemberId && '✓'}
              </button>
            ))}

            {/* Separator + Archive action */}
            <div className="my-1" style={{ borderTop: '1px solid #f1f5f9' }} />
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); archive() }}
              disabled={archiving}
              className="w-full text-left px-3 py-2 rounded-lg text-[12px] font-semibold hover:bg-slate-100 disabled:opacity-50 flex items-center gap-2"
              style={{ color: '#64748b' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="5" rx="1" />
                <path d="M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
                <path d="M10 13h4" />
              </svg>
              {archiving ? 'Arquivando...' : 'Arquivar lead'}
            </button>

            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 rounded-lg text-[11px] mt-1"
              style={{ color: '#94a3b8' }}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
