'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Agent { id: string; name: string }
interface Props {
  leadId: string
  currentName: string | null
  agents: Agent[]
}

/** Mostra o agente dono do lead; clicar abre um seletor pra repassar pra outro agente. */
export function ReassignControl({ leadId, currentName, agents }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)

  async function reassign(toId: string) {
    if (!toId) { setEditing(false); return }
    setLoading(true)
    try {
      const r = await fetch('/api/admin/reassign-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, to_buyer_id: toId }),
      })
      if (r.ok) {
        router.refresh()
      } else {
        const d = await r.json().catch(() => ({}))
        alert(d.error || 'Falha ao repassar o lead')
        setLoading(false)
      }
    } catch {
      alert('Erro de rede ao repassar')
      setLoading(false)
    }
    setEditing(false)
  }

  if (loading) {
    return <span className="text-[12px]" style={{ color: '#94a3b8' }}>repassando…</span>
  }

  if (editing) {
    return (
      <select
        autoFocus
        defaultValue=""
        onChange={e => reassign(e.target.value)}
        onBlur={() => setEditing(false)}
        className="text-[12px] px-2 py-1 rounded-lg cursor-pointer"
        style={{ border: '1px solid #6366f1', maxWidth: 150, outline: 'none' }}
      >
        <option value="">— repassar pra —</option>
        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Repassar pra outro agente"
      className="text-[12px] font-medium hover:underline text-left flex items-center gap-1"
      style={{ color: currentName ? '#64748b' : '#f59e0b' }}
    >
      {currentName || 'Na fila'}
      <span style={{ color: '#a5b4fc' }}>↪</span>
    </button>
  )
}
