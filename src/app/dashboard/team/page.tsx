'use client'

import { useState, useEffect } from 'react'
import { useT } from '@/lib/i18n-client'

interface Member {
  id: string
  name: string
  email: string | null
  phone: string | null
  whatsapp: string | null
  is_active: boolean
  leads_count: number
  created_at: string
}

export default function TeamPage() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [members, setMembers] = useState<Member[]>([])
  const [mode, setMode] = useState<'manual' | 'auto_roundrobin'>('manual')
  const [isAgency, setIsAgency] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [authUserId, setAuthUserId] = useState('')

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    if (cookie) {
      try {
        const token = JSON.parse(atob(decodeURIComponent(cookie.substring(cookie.indexOf('=') + 1))))
        const payload = JSON.parse(atob(token.access_token.split('.')[1]))
        setAuthUserId(payload.sub)
        loadData(payload.sub)
      } catch {}
    }
    setLoading(false)
  }, [])

  async function loadData(authId: string) {
    // Load buyer settings
    const settingsRes = await fetch(`/api/team/members?auth_user_id=${authId}`)
    const settingsData = await settingsRes.json()
    setMembers(settingsData.members || [])

    // Load buyer mode
    const buyerRes = await fetch(`/api/settings?auth_user_id=${authId}`)
    if (buyerRes.ok) {
      const buyerData = await buyerRes.json()
      setIsAgency(buyerData.is_agency || false)
      setMode(buyerData.team_distribution_mode || 'manual')
    }
  }

  async function addMember() {
    if (!newName.trim()) return
    setSaving(true)
    await fetch('/api/team/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_user_id: authUserId, name: newName, email: newEmail, phone: newPhone }),
    })
    setNewName(''); setNewEmail(''); setNewPhone('')
    setShowAdd(false)
    setSaving(false)
    loadData(authUserId)
  }

  async function toggleMember(id: string, active: boolean) {
    await fetch(`/api/team/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !active }),
    })
    loadData(authUserId)
  }

  function startEdit(m: Member) {
    setEditingId(m.id)
    setEditName(m.name)
    setEditEmail(m.email || '')
    setEditPhone(m.phone || '')
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return
    setSaving(true)
    await fetch(`/api/team/members/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, email: editEmail || null, phone: editPhone || null }),
    })
    setEditingId(null)
    setSaving(false)
    loadData(authUserId)
  }

  async function removeMember(id: string) {
    if (!confirm(L('Remover este membro do time?', 'Remove this member from the team?', '¿Eliminar a este miembro del equipo?'))) return
    await fetch(`/api/team/members/${id}`, { method: 'DELETE' })
    loadData(authUserId)
  }

  async function updateMode(newMode: 'manual' | 'auto_roundrobin') {
    setMode(newMode)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_user_id: authUserId, is_agency: true, team_distribution_mode: newMode }),
    })
  }

  const totalLeads = members.reduce((s, m) => s + m.leads_count, 0)
  const activeCount = members.filter(m => m.is_active).length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: 'var(--fg)' }}>{L('Meu Time', 'My Team', 'Mi Equipo')}</h1>
          <p className="text-[14px] mt-1" style={{ color: 'var(--fg-secondary)' }}>{L('Gerencie os agentes da sua agencia', 'Manage your agency\'s agents', 'Administra los agentes de tu agencia')}</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white"
          style={{ background: '#6366f1' }}>
          {L('+ Adicionar Agente', '+ Add Agent', '+ Agregar Agente')}
        </button>
      </div>

      {/* Distribution Mode Toggle */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: 'var(--bg)', border: '1px solid #e8ecf4' }}>
        <p className="text-[13px] font-bold mb-3" style={{ color: 'var(--fg)' }}>{L('Modo de Distribuicao', 'Distribution Mode', 'Modo de Distribución')}</p>
        <div className="flex gap-3">
          <button onClick={() => updateMode('auto_roundrobin')}
            className="flex-1 py-3 rounded-xl text-[13px] font-bold transition-all"
            style={{
              background: mode === 'auto_roundrobin' ? '#6366f1' : 'var(--bg-card)',
              color: mode === 'auto_roundrobin' ? '#fff' : 'var(--fg-secondary)',
              border: `1px solid ${mode === 'auto_roundrobin' ? '#6366f1' : 'var(--border)'}`,
            }}>
            {L('Automatico (Round-Robin)', 'Automatic (Round-Robin)', 'Automático (Round-Robin)')}
          </button>
          <button onClick={() => updateMode('manual')}
            className="flex-1 py-3 rounded-xl text-[13px] font-bold transition-all"
            style={{
              background: mode === 'manual' ? '#6366f1' : 'var(--bg-card)',
              color: mode === 'manual' ? '#fff' : 'var(--fg-secondary)',
              border: `1px solid ${mode === 'manual' ? '#6366f1' : 'var(--border)'}`,
            }}>
            {L('Manual (Eu Escolho)', 'Manual (I Choose)', 'Manual (Yo Elijo)')}
          </button>
        </div>
        <p className="text-[11px] mt-2" style={{ color: 'var(--fg-muted)' }}>
          {mode === 'auto_roundrobin'
            ? L('Leads serao distribuidos automaticamente entre os agentes ativos do seu time.', 'Leads will be distributed automatically among your team\'s active agents.', 'Los leads se distribuirán automáticamente entre los agentes activos de tu equipo.')
            : L('Voce recebe o lead e escolhe manualmente pra qual agente enviar.', 'You receive the lead and manually choose which agent to send it to.', 'Tú recibes el lead y eliges manualmente a qué agente enviarlo.')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-4 text-center" style={{ background: 'var(--bg)', border: '1px solid #e8ecf4' }}>
          <p className="text-[24px] font-extrabold" style={{ color: '#6366f1' }}>{members.length}</p>
          <p className="text-[11px] font-bold" style={{ color: 'var(--fg-muted)' }}>{L('Total Agentes', 'Total Agents', 'Total de Agentes')}</p>
        </div>
        <div className="rounded-xl p-4 text-center" style={{ background: 'var(--bg)', border: '1px solid #e8ecf4' }}>
          <p className="text-[24px] font-extrabold" style={{ color: '#10b981' }}>{activeCount}</p>
          <p className="text-[11px] font-bold" style={{ color: 'var(--fg-muted)' }}>{L('Ativos', 'Active', 'Activos')}</p>
        </div>
        <div className="rounded-xl p-4 text-center" style={{ background: 'var(--bg)', border: '1px solid #e8ecf4' }}>
          <p className="text-[24px] font-extrabold" style={{ color: '#f59e0b' }}>{totalLeads}</p>
          <p className="text-[11px] font-bold" style={{ color: 'var(--fg-muted)' }}>{L('Leads Distribuidos', 'Leads Distributed', 'Leads Distribuidos')}</p>
        </div>
      </div>

      {/* Add Member Modal */}
      {showAdd && (
        <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--bg-card)', border: '2px solid #6366f1', boxShadow: '0 4px 20px rgba(99,102,241,0.1)' }}>
          <h3 className="text-[16px] font-bold mb-4" style={{ color: 'var(--fg)' }}>{L('Novo Agente', 'New Agent', 'Nuevo Agente')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <input type="text" placeholder={L('Nome *', 'Name *', 'Nombre *')} value={newName} onChange={e => setNewName(e.target.value)}
              className="px-4 py-3 rounded-xl text-[13px]" style={{ background: 'var(--bg)', border: '1px solid #e8ecf4' }} />
            <input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
              className="px-4 py-3 rounded-xl text-[13px]" style={{ background: 'var(--bg)', border: '1px solid #e8ecf4' }} />
            <input type="tel" placeholder="WhatsApp" value={newPhone} onChange={e => setNewPhone(e.target.value)}
              className="px-4 py-3 rounded-xl text-[13px]" style={{ background: 'var(--bg)', border: '1px solid #e8ecf4' }} />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowAdd(false)} className="px-5 py-2.5 rounded-xl text-[13px] font-bold" style={{ color: 'var(--fg-secondary)' }}>{L('Cancelar', 'Cancel', 'Cancelar')}</button>
            <button onClick={addMember} disabled={saving || !newName.trim()}
              className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: '#6366f1' }}>
              {saving ? L('Salvando...', 'Saving...', 'Guardando...') : L('Adicionar', 'Add', 'Agregar')}
            </button>
          </div>
        </div>
      )}

      {/* Members List */}
      {members.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--bg)', border: '1px solid #e8ecf4' }}>
          <p className="text-[32px] mb-3">👥</p>
          <p className="text-[16px] font-bold" style={{ color: 'var(--fg)' }}>{L('Nenhum agente no time', 'No agents on the team', 'Ningún agente en el equipo')}</p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--fg-muted)' }}>{L('Adicione agentes pra distribuir leads automaticamente.', 'Add agents to distribute leads automatically.', 'Agrega agentes para distribuir leads automáticamente.')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map(m => (
            <div key={m.id} className="rounded-xl p-4"
              style={{ background: 'var(--bg-card)', border: editingId === m.id ? '2px solid #6366f1' : '1px solid #e8ecf4', opacity: m.is_active ? 1 : 0.5 }}>

              {editingId === m.id ? (
                /* Edit mode */
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder={L('Nome *', 'Name *', 'Nombre *')}
                      className="px-3 py-2.5 rounded-lg text-[13px] font-medium" style={{ background: 'var(--bg)', border: '1px solid #e8ecf4' }} />
                    <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="Email"
                      className="px-3 py-2.5 rounded-lg text-[13px] font-medium" style={{ background: 'var(--bg)', border: '1px solid #e8ecf4' }} />
                    <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="WhatsApp"
                      className="px-3 py-2.5 rounded-lg text-[13px] font-medium" style={{ background: 'var(--bg)', border: '1px solid #e8ecf4' }} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-lg text-[12px] font-semibold" style={{ color: 'var(--fg-muted)' }}>{L('Cancelar', 'Cancel', 'Cancelar')}</button>
                    <button onClick={saveEdit} disabled={saving || !editName.trim()}
                      className="px-5 py-2 rounded-lg text-[12px] font-bold text-white disabled:opacity-50"
                      style={{ background: '#6366f1' }}>
                      {saving ? L('Salvando...', 'Saving...', 'Guardando...') : L('Salvar', 'Save', 'Guardar')}
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] font-bold"
                    style={{ background: m.is_active ? '#6366f1' : '#94a3b8' }}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold truncate" style={{ color: 'var(--fg)' }}>{m.name}</p>
                    <p className="text-[12px] truncate" style={{ color: 'var(--fg-muted)' }}>
                      {m.phone || m.email || L('Sem contato', 'No contact info', 'Sin contacto')}
                    </p>
                  </div>
                  <div className="text-center px-3">
                    <p className="text-[18px] font-extrabold" style={{ color: '#6366f1' }}>{m.leads_count}</p>
                    <p className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>leads</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(m)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
                      style={{ background: 'var(--accent-light)', color: '#6366f1' }}>
                      {L('Editar', 'Edit', 'Editar')}
                    </button>
                    <button onClick={() => toggleMember(m.id, m.is_active)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
                      style={{
                        background: m.is_active ? 'var(--warn-line)' : 'var(--ok-line)',
                        color: m.is_active ? '#92400e' : '#166534',
                      }}>
                      {m.is_active ? L('Pausar', 'Pause', 'Pausar') : L('Ativar', 'Activate', 'Activar')}
                    </button>
                    <button onClick={() => removeMember(m.id)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
                      style={{ background: 'var(--err-soft)', color: '#ef4444' }}>
                      {L('Remover', 'Remove', 'Eliminar')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
