'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  leadId: string
  members: { id: string; name: string }[]
  currentMember?: string | null
}

export function AssignButton({ leadId, members, currentMember }: Props) {
  const [open, setOpen] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const router = useRouter()

  async function assign(memberId: string | null) {
    setAssigning(true)
    if (memberId) {
      await fetch('/api/team/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, member_id: memberId }),
      })
    } else {
      // Unassign — remove member, keep with owner
      await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to_member: null }),
      })
    }
    setAssigning(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <div className="relative">
      <button onClick={(e) => { e.preventDefault(); setOpen(!open) }}
        className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:shadow-sm"
        style={{
          background: currentMember ? '#eef2ff' : '#fef3c7',
          color: currentMember ? '#6366f1' : '#92400e',
        }}>
        {currentMember || 'Atribuir'}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.preventDefault(); setOpen(false) }} />
          <div className="absolute right-0 bottom-full mb-1 z-50 rounded-xl p-2 min-w-[180px]"
            style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 -4px 24px rgba(0,0,0,0.12)' }}>
            <p className="text-[10px] font-bold px-2 py-1 mb-1" style={{ color: '#94a3b8' }}>
              {currentMember ? 'Transferir pra:' : 'Enviar pra:'}
            </p>

            {/* Back to me option */}
            {currentMember && (
              <button onClick={(e) => { e.preventDefault(); assign(null) }}
                disabled={assigning}
                className="w-full text-left px-3 py-2 rounded-lg text-[12px] font-semibold hover:bg-amber-50 disabled:opacity-50 mb-1"
                style={{ color: '#b45309', borderBottom: '1px solid #f1f5f9' }}>
                Voltar pra mim
              </button>
            )}

            {/* Team members */}
            {members.map(m => (
              <button key={m.id} onClick={(e) => { e.preventDefault(); assign(m.id) }}
                disabled={assigning}
                className="w-full text-left px-3 py-2 rounded-lg text-[12px] font-semibold hover:bg-indigo-50 disabled:opacity-50"
                style={{ color: m.name === currentMember ? '#6366f1' : '#1a1a2e' }}>
                {m.name} {m.name === currentMember && '✓'}
              </button>
            ))}

            <button onClick={(e) => { e.preventDefault(); setOpen(false) }}
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
