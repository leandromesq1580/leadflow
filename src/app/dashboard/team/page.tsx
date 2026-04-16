'use client'

import { useState, useEffect } from 'react'

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
  const [members, setMembers] = useState<Member[]>([])
  const [mode, setMode] = useState<'manual' | 'auto_roundrobin'>('manual')
  const [isAgency, setIsAgency] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [authUserId, setAuthUserId] = useState('')

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    if (cookie) {
      try {
        const token = JSON.parse(atob(cookie.split('=')[1]))
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

  async function removeMember(id: string) {
    if (!confirm('Remover este membro do time?')) return
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
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Meu Time</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>Gerencie os agentes da sua agencia</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white"
          style={{ background: '#6366f1' }}>
          + Adicionar Agente
        </button>
      </div>

      {/* Distribution Mode Toggle */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
        <p className="text-[13px] font-bold mb-3" style={{ color: '#1a1a2e' }}>Modo de Distribuicao</p>
        <div className="flex gap-3">
          <button onClick={() => updateMode('auto_roundrobin')}
            className="flex-1 py-3 rounded-xl text-[13px] font-bold transition-all"
            style={{
              background: mode === 'auto_roundrobin' ? '#6366f1' : '#fff',
              color: mode === 'auto_roundrobin' ? '#fff' : '#64748b',
              border: `1px solid ${mode === 'auto_roundrobin' ? '#6366f1' : '#e8ecf4'}`,
            }}>
            Automatico (Round-Robin)
          </button>
          <button onClick={() => updateMode('manual')}
            className="flex-1 py-3 rounded-xl text-[13px] font-bold transition-all"
            style={{
              background: mode === 'manual' ? '#6366f1' : '#fff',
              color: mode === 'manual' ? '#fff' : '#64748b',
              border: `1px solid ${mode === 'manual' ? '#6366f1' : '#e8ecf4'}`,
            }}>
            Manual (Eu Escolho)
          </button>
        </div>
        <p className="text-[11px] mt-2" style={{ color: '#94a3b8' }}>
          {mode === 'auto_roundrobin'
            ? 'Leads serao distribuidos automaticamente entre os agentes ativos do seu time.'
            : 'Voce recebe o lead e escolhe manualmente pra qual agente enviar.'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl p-4 text-center" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
          <p className="text-[24px] font-extrabold" style={{ color: '#6366f1' }}>{members.length}</p>
          <p className="text-[11px] font-bold" style={{ color: '#94a3b8' }}>Total Agentes</p>
        </div>
        <div className="rounded-xl p-4 text-center" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
          <p className="text-[24px] font-extrabold" style={{ color: '#10b981' }}>{activeCount}</p>
          <p className="text-[11px] font-bold" style={{ color: '#94a3b8' }}>Ativos</p>
        </div>
        <div className="rounded-xl p-4 text-center" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
          <p className="text-[24px] font-extrabold" style={{ color: '#f59e0b' }}>{totalLeads}</p>
          <p className="text-[11px] font-bold" style={{ color: '#94a3b8' }}>Leads Distribuidos</p>
        </div>
      </div>

      {/* Add Member Modal */}
      {showAdd && (
        <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '2px solid #6366f1', boxShadow: '0 4px 20px rgba(99,102,241,0.1)' }}>
          <h3 className="text-[16px] font-bold mb-4" style={{ color: '#1a1a2e' }}>Novo Agente</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <input type="text" placeholder="Nome *" value={newName} onChange={e => setNewName(e.target.value)}
              className="px-4 py-3 rounded-xl text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
            <input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
              className="px-4 py-3 rounded-xl text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
            <input type="tel" placeholder="WhatsApp" value={newPhone} onChange={e => setNewPhone(e.target.value)}
              className="px-4 py-3 rounded-xl text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowAdd(false)} className="px-5 py-2.5 rounded-xl text-[13px] font-bold" style={{ color: '#64748b' }}>Cancelar</button>
            <button onClick={addMember} disabled={saving || !newName.trim()}
              className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: '#6366f1' }}>
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </div>
      )}

      {/* Members List */}
      {members.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
          <p className="text-[32px] mb-3">👥</p>
          <p className="text-[16px] font-bold" style={{ color: '#1a1a2e' }}>Nenhum agente no time</p>
          <p className="text-[13px] mt-1" style={{ color: '#94a3b8' }}>Adicione agentes pra distribuir leads automaticamente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {members.map(m => (
            <div key={m.id} className="rounded-xl p-4 flex items-center gap-4"
              style={{ background: '#fff', border: '1px solid #e8ecf4', opacity: m.is_active ? 1 : 0.5 }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] font-bold"
                style={{ background: m.is_active ? '#6366f1' : '#94a3b8' }}>
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold truncate" style={{ color: '#1a1a2e' }}>{m.name}</p>
                <p className="text-[12px] truncate" style={{ color: '#94a3b8' }}>
                  {m.phone || m.email || 'Sem contato'}
                </p>
              </div>
              <div className="text-center px-3">
                <p className="text-[18px] font-extrabold" style={{ color: '#6366f1' }}>{m.leads_count}</p>
                <p className="text-[10px]" style={{ color: '#94a3b8' }}>leads</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => toggleMember(m.id, m.is_active)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
                  style={{
                    background: m.is_active ? '#fef3c7' : '#dcfce7',
                    color: m.is_active ? '#92400e' : '#166534',
                  }}>
                  {m.is_active ? 'Pausar' : 'Ativar'}
                </button>
                <button onClick={() => removeMember(m.id)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
                  style={{ background: '#fef2f2', color: '#ef4444' }}>
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
