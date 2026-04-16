'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  leadId: string
  members: { id: string; name: string }[]
}

export function AssignButton({ leadId, members }: Props) {
  const [open, setOpen] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const router = useRouter()

  async function assign(memberId: string) {
    setAssigning(true)
    await fetch('/api/team/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, member_id: memberId }),
    })
    setAssigning(false)
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button onClick={(e) => { e.preventDefault(); setOpen(true) }}
        className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
        style={{ background: '#fef3c7', color: '#92400e' }}>
        Atribuir
      </button>
    )
  }

  return (
    <div className="relative">
      <div className="fixed inset-0 z-40" onClick={(e) => { e.preventDefault(); setOpen(false) }} />
      <div className="absolute right-0 top-0 z-50 rounded-xl p-2 min-w-[160px]"
        style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
        <p className="text-[10px] font-bold px-2 py-1 mb-1" style={{ color: '#94a3b8' }}>Enviar pra:</p>
        {members.map(m => (
          <button key={m.id} onClick={(e) => { e.preventDefault(); assign(m.id) }}
            disabled={assigning}
            className="w-full text-left px-3 py-2 rounded-lg text-[12px] font-semibold hover:bg-indigo-50 disabled:opacity-50"
            style={{ color: '#1a1a2e' }}>
            {m.name}
          </button>
        ))}
        <button onClick={(e) => { e.preventDefault(); setOpen(false) }}
          className="w-full text-left px-3 py-1.5 rounded-lg text-[11px] mt-1"
          style={{ color: '#94a3b8' }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
