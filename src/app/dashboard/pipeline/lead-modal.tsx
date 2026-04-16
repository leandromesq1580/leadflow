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
    fetch(`/api/leads/${leadId}`).then(r => r.json()).then(d => setLead(d.lead || d))
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

  if (!lead) return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[540px]" style={{ background: '#fff' }}>
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      </div>
    </>
  )

  const hue = (lead.name?.charCodeAt(0) * 47 + (lead.name?.charCodeAt(1) || 0) * 23) % 360

  const input = (label: string, field: string, type = 'text', icon = '') => (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#94a3b8' }}>
        {icon && <span className="mr-1">{icon}</span>}{label}
      </label>
      <input type={type} value={lead[field] || ''} onChange={e => setLead({ ...lead, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
        className="w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all focus:outline-none focus:ring-2 focus:ring-indigo-200"
        style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
    </div>
  )

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[540px] overflow-y-auto"
        style={{ background: '#fff', boxShadow: '-8px 0 40px rgba(0,0,0,0.12)' }}>

        {/* Header with gradient */}
        <div className="relative px-7 pt-7 pb-5" style={{ background: `linear-gradient(135deg, hsl(${hue}, 55%, 96%), #fff)` }}>
          <button onClick={onClose} className="absolute top-5 right-5 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5"
            style={{ color: '#94a3b8' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-[15px] font-extrabold text-white"
              style={{ background: `hsl(${hue}, 55%, 50%)`, boxShadow: `0 4px 12px hsl(${hue}, 55%, 50%, 0.3)` }}>
              {lead.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-[20px] font-extrabold" style={{ color: '#1a1a2e' }}>{lead.name}</h2>
              <p className="text-[12px] font-medium" style={{ color: '#94a3b8' }}>
                {lead.phone} {lead.state && `· ${lead.state}`}
              </p>
            </div>
          </div>
        </div>

        <div className="px-7 pb-7">
          {/* Tabs */}
          <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: '#f1f5f9' }}>
            {[
              { key: 'details', label: 'Detalhes', icon: '📋' },
              { key: 'followups', label: `Follow-ups (${followUps.length})`, icon: '📌' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                className="flex-1 py-2.5 rounded-lg text-[12px] font-bold transition-all"
                style={{
                  background: tab === t.key ? '#fff' : 'transparent',
                  color: tab === t.key ? '#6366f1' : '#94a3b8',
                  boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {tab === 'details' && (
            <div className="space-y-5">
              {/* Contact section */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#c0c8d4' }}>Contato</p>
                <div className="grid grid-cols-2 gap-3">
                  {input('Nome', 'name', 'text', '👤')}
                  {input('Telefone', 'phone', 'tel', '📞')}
                  {input('Email', 'email', 'email', '📧')}
                  {input('Estado', 'state', 'text', '📍')}
                </div>
              </div>

              {/* Lead info section */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#c0c8d4' }}>Informacoes</p>
                <div className="grid grid-cols-2 gap-3">
                  {input('Cidade', 'city')}
                  {input('Interesse', 'interest')}
                  {input('Plataforma', 'platform')}
                  {input('Campanha', 'campaign_name')}
                  {input('Faixa Etaria', 'age_range')}
                  {input('Atendente', 'attendant')}
                  {input('Motivo', 'reason')}
                  {input('Valor Apolice', 'policy_value', 'number', '💰')}
                </div>
              </div>

              {/* Flags */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#c0c8d4' }}>Status</p>
                <div className="flex gap-3">
                  <label className="flex-1 flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all"
                    style={{ background: lead.is_organic ? '#f0fdf4' : '#f8f9fc', border: `1px solid ${lead.is_organic ? '#86efac' : '#e8ecf4'}` }}>
                    <input type="checkbox" checked={lead.is_organic || false}
                      onChange={e => setLead({ ...lead, is_organic: e.target.checked })}
                      className="w-4 h-4 rounded accent-green-500" />
                    <div>
                      <span className="text-[12px] font-bold block" style={{ color: '#1a1a2e' }}>Lead Organico</span>
                      <span className="text-[10px]" style={{ color: '#94a3b8' }}>Nao veio de campanha paga</span>
                    </div>
                  </label>
                  <label className="flex-1 flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all"
                    style={{ background: lead.contract_closed ? '#f0fdf4' : '#f8f9fc', border: `1px solid ${lead.contract_closed ? '#86efac' : '#e8ecf4'}` }}>
                    <input type="checkbox" checked={lead.contract_closed || false}
                      onChange={e => setLead({ ...lead, contract_closed: e.target.checked })}
                      className="w-4 h-4 rounded accent-green-500" />
                    <div>
                      <span className="text-[12px] font-bold block" style={{ color: '#1a1a2e' }}>Contrato Fechado</span>
                      <span className="text-[10px]" style={{ color: '#94a3b8' }}>Apolice emitida</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Observation */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#94a3b8' }}>
                  📝 Observacao
                </label>
                <textarea value={lead.observation || ''} onChange={e => setLead({ ...lead, observation: e.target.value })}
                  rows={3} placeholder="Notas sobre este lead..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium resize-none transition-all focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-3" style={{ borderTop: '1px solid #f1f5f9' }}>
                <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors hover:bg-gray-50" style={{ color: '#64748b' }}>
                  Cancelar
                </button>
                <button onClick={saveLead} disabled={saving}
                  className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50 transition-all"
                  style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.25)' }}>
                  {saving ? 'Salvando...' : 'Salvar Alteracoes'}
                </button>
              </div>
            </div>
          )}

          {tab === 'followups' && (
            <div>
              {/* New follow-up button */}
              <button onClick={() => setShowNewFU(true)}
                className="w-full py-3 rounded-xl text-[13px] font-bold mb-5 transition-all hover:shadow-sm"
                style={{ background: '#f0f4ff', color: '#6366f1', border: '1px dashed #c7d2fe' }}>
                + Novo Follow-up
              </button>

              {/* New follow-up form */}
              {showNewFU && (
                <div className="rounded-xl p-5 mb-5" style={{ background: '#fafbff', border: '1px solid #e0e7ff' }}>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: '#94a3b8' }}>Tipo</p>
                  <div className="flex gap-1.5 mb-4 flex-wrap">
                    {FOLLOW_UP_TYPES.map(t => (
                      <button key={t.key} onClick={() => setFuType(t.key)}
                        className="px-3 py-2 rounded-lg text-[11px] font-bold transition-all"
                        style={{
                          background: fuType === t.key ? '#6366f1' : '#fff',
                          color: fuType === t.key ? '#fff' : '#64748b',
                          border: `1px solid ${fuType === t.key ? '#6366f1' : '#e8ecf4'}`,
                          boxShadow: fuType === t.key ? '0 2px 8px rgba(99,102,241,0.25)' : 'none',
                        }}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                  <textarea value={fuDesc} onChange={e => setFuDesc(e.target.value)} placeholder="O que aconteceu ou precisa ser feito..."
                    rows={2} className="w-full px-3.5 py-2.5 rounded-xl text-[13px] resize-none mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    style={{ background: '#fff', border: '1px solid #e8ecf4' }} />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowNewFU(false)} className="px-4 py-2 text-[12px] font-semibold rounded-lg" style={{ color: '#94a3b8' }}>Cancelar</button>
                    <button onClick={addFollowUp} disabled={!fuDesc.trim()}
                      className="px-5 py-2 rounded-lg text-[12px] font-bold text-white disabled:opacity-40"
                      style={{ background: '#6366f1' }}>Salvar</button>
                  </div>
                </div>
              )}

              {/* Follow-up list */}
              {followUps.length === 0 ? (
                <div className="text-center py-12">
                  <span className="text-[32px] block mb-2">📌</span>
                  <p className="text-[13px] font-semibold" style={{ color: '#94a3b8' }}>Nenhum follow-up registrado</p>
                  <p className="text-[11px] mt-1" style={{ color: '#c0c8d4' }}>Registre ligacoes, notas e reunioes</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {followUps.map(fu => {
                    const typeInfo = FOLLOW_UP_TYPES.find(t => t.key === fu.type) || FOLLOW_UP_TYPES[0]
                    const done = !!fu.completed_at
                    return (
                      <div key={fu.id} className="rounded-xl p-4 flex gap-3 transition-all"
                        style={{
                          background: done ? '#f8fdf9' : '#fff',
                          border: `1px solid ${done ? '#d1fae5' : '#e8ecf4'}`,
                        }}>
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: done ? '#dcfce7' : '#f0f4ff' }}>
                          <span className="text-[14px]">{typeInfo.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e', textDecoration: done ? 'line-through' : 'none' }}>
                            {fu.description}
                          </p>
                          <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>
                            {new Date(fu.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {typeInfo.label}
                          </p>
                        </div>
                        {!done && (
                          <button onClick={() => completeFollowUp(fu.id)}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg self-start transition-all hover:shadow-sm"
                            style={{ background: '#dcfce7', color: '#166534' }}>
                            ✓ Concluir
                          </button>
                        )}
                        {done && (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg self-start" style={{ color: '#10b981' }}>✓</span>
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
