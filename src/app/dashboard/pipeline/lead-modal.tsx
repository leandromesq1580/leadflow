'use client'

import { useState, useEffect } from 'react'

interface Props {
  leadId: string
  buyerId: string
  onClose: () => void
  onSaved: () => void
}

interface FollowUp {
  id: string; type: string; description: string; scheduled_at: string | null; completed_at: string | null; created_at: string
}

const FOLLOW_UP_TYPES = [
  { key: 'note', label: 'Nota', icon: '📝' },
  { key: 'call', label: 'Ligacao', icon: '📞' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { key: 'email', label: 'Email', icon: '📧' },
  { key: 'meeting', label: 'Reuniao', icon: '🤝' },
]

export function LeadModal({ leadId, buyerId, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<'details' | 'followups'>('details')
  const [lead, setLead] = useState<any>(null)
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [saving, setSaving] = useState(false)
  const [showNewFU, setShowNewFU] = useState(false)
  const [fuType, setFuType] = useState('note')
  const [fuDesc, setFuDesc] = useState('')

  useEffect(() => {
    fetch(`/api/leads/${leadId}`).then(r => r.json()).then(d => setLead(d))
    loadFollowUps()
  }, [leadId])

  async function loadFollowUps() {
    const r = await fetch(`/api/leads/${leadId}/follow-ups`)
    const d = await r.json()
    setFollowUps(d.followUps || [])
  }

  async function saveLead() {
    setSaving(true)
    await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: lead.name, email: lead.email, phone: lead.phone,
        state: lead.state, city: lead.city, interest: lead.interest,
        platform: lead.platform, reason: lead.reason,
        age_range: lead.age_range, attendant: lead.attendant,
        is_organic: lead.is_organic, contract_closed: lead.contract_closed,
        policy_value: lead.policy_value, observation: lead.observation,
      }),
    })
    setSaving(false)
    onSaved()
  }

  async function addFollowUp() {
    if (!fuDesc.trim()) return
    await fetch(`/api/leads/${leadId}/follow-ups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyer_id: buyerId, type: fuType, description: fuDesc }),
    })
    setFuDesc('')
    setShowNewFU(false)
    loadFollowUps()
  }

  async function completeFollowUp(fuId: string) {
    await fetch(`/api/follow-ups/${fuId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    })
    loadFollowUps()
  }

  if (!lead) return null

  const input = (label: string, field: string, type = 'text') => (
    <div>
      <label className="block text-[11px] font-bold mb-1" style={{ color: '#64748b' }}>{label}</label>
      <input type={type} value={lead[field] || ''} onChange={e => setLead({ ...lead, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
        className="w-full px-3 py-2 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
    </div>
  )

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] overflow-y-auto" style={{ background: '#fff', boxShadow: '-4px 0 30px rgba(0,0,0,0.1)' }}>
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[20px] font-extrabold" style={{ color: '#1a1a2e' }}>{lead.name}</h2>
            <button onClick={onClose} className="text-[20px]" style={{ color: '#94a3b8' }}>✕</button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: '#f1f5f9' }}>
            <button onClick={() => setTab('details')} className="flex-1 py-2 rounded-lg text-[13px] font-bold"
              style={{ background: tab === 'details' ? '#fff' : 'transparent', color: tab === 'details' ? '#6366f1' : '#64748b' }}>
              Detalhes
            </button>
            <button onClick={() => setTab('followups')} className="flex-1 py-2 rounded-lg text-[13px] font-bold"
              style={{ background: tab === 'followups' ? '#fff' : 'transparent', color: tab === 'followups' ? '#6366f1' : '#64748b' }}>
              Follow-ups ({followUps.length})
            </button>
          </div>

          {tab === 'details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {input('Nome', 'name')}
                {input('Email', 'email', 'email')}
                {input('Telefone', 'phone', 'tel')}
                {input('Estado', 'state')}
                {input('Cidade', 'city')}
                {input('Interesse', 'interest')}
                {input('Plataforma', 'platform')}
                {input('Campanha', 'campaign_name')}
                {input('Faixa Etaria', 'age_range')}
                {input('Atendente', 'attendant')}
                {input('Motivo', 'reason')}
                {input('Valor Apolice', 'policy_value', 'number')}
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={lead.is_organic || false}
                    onChange={e => setLead({ ...lead, is_organic: e.target.checked })}
                    className="w-4 h-4 rounded" />
                  <span className="text-[12px] font-semibold" style={{ color: '#1a1a2e' }}>Lead Organico</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={lead.contract_closed || false}
                    onChange={e => setLead({ ...lead, contract_closed: e.target.checked })}
                    className="w-4 h-4 rounded" />
                  <span className="text-[12px] font-semibold" style={{ color: '#1a1a2e' }}>Contrato Fechado</span>
                </label>
              </div>

              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ color: '#64748b' }}>Observacao</label>
                <textarea value={lead.observation || ''} onChange={e => setLead({ ...lead, observation: e.target.value })}
                  rows={3} className="w-full px-3 py-2 rounded-lg text-[13px] resize-none"
                  style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-semibold" style={{ color: '#64748b' }}>Cancelar</button>
                <button onClick={saveLead} disabled={saving}
                  className="px-5 py-2 rounded-lg text-[13px] font-bold text-white disabled:opacity-50"
                  style={{ background: '#6366f1' }}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          )}

          {tab === 'followups' && (
            <div>
              <button onClick={() => setShowNewFU(true)}
                className="w-full py-2.5 rounded-xl text-[13px] font-bold mb-4"
                style={{ background: '#eef2ff', color: '#6366f1', border: '1px dashed #c7d2fe' }}>
                + Novo Follow-up
              </button>

              {showNewFU && (
                <div className="rounded-xl p-4 mb-4" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {FOLLOW_UP_TYPES.map(t => (
                      <button key={t.key} onClick={() => setFuType(t.key)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
                        style={{
                          background: fuType === t.key ? '#6366f1' : '#fff',
                          color: fuType === t.key ? '#fff' : '#64748b',
                          border: `1px solid ${fuType === t.key ? '#6366f1' : '#e8ecf4'}`,
                        }}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea value={fuDesc} onChange={e => setFuDesc(e.target.value)} placeholder="Descricao..."
                    rows={2} className="w-full px-3 py-2 rounded-lg text-[13px] resize-none mb-3"
                    style={{ background: '#fff', border: '1px solid #e8ecf4' }} />
                  <div className="flex gap-2">
                    <button onClick={() => setShowNewFU(false)} className="px-4 py-2 text-[12px] font-semibold" style={{ color: '#94a3b8' }}>Cancelar</button>
                    <button onClick={addFollowUp} className="px-4 py-2 rounded-lg text-[12px] font-bold text-white" style={{ background: '#6366f1' }}>Salvar</button>
                  </div>
                </div>
              )}

              {followUps.length === 0 ? (
                <p className="text-center py-8 text-[13px]" style={{ color: '#94a3b8' }}>Nenhum follow-up registrado</p>
              ) : (
                <div className="space-y-2">
                  {followUps.map(fu => {
                    const typeInfo = FOLLOW_UP_TYPES.find(t => t.key === fu.type) || FOLLOW_UP_TYPES[0]
                    return (
                      <div key={fu.id} className="rounded-xl p-3 flex gap-3"
                        style={{ background: fu.completed_at ? '#f0fdf4' : '#fff', border: '1px solid #e8ecf4' }}>
                        <span className="text-[16px]">{typeInfo.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e', textDecoration: fu.completed_at ? 'line-through' : 'none' }}>
                            {fu.description}
                          </p>
                          <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>
                            {new Date(fu.created_at).toLocaleDateString('pt-BR')} · {typeInfo.label}
                          </p>
                        </div>
                        {!fu.completed_at && (
                          <button onClick={() => completeFollowUp(fu.id)}
                            className="text-[11px] font-bold px-2 py-1 rounded-lg self-start"
                            style={{ background: '#dcfce7', color: '#166534' }}>
                            Concluir
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
