'use client'

import { useState, useEffect } from 'react'
import { renderTemplate } from '@/lib/template-render'

interface Template {
  id: string; name: string; type: 'whatsapp' | 'email'; subject: string | null; body: string; is_system: boolean
}

interface Lead {
  id: string; name?: string | null; phone?: string | null; email?: string | null
  state?: string | null; interest?: string | null; city?: string | null
}

interface Agent {
  id: string; name?: string | null; email?: string | null; phone?: string | null
}

interface Props {
  lead: Lead
  agent: Agent
  onClose: () => void
  onSent?: () => void
}

export function SendMessageModal({ lead, agent: initialAgent, onClose, onSent }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [customBody, setCustomBody] = useState('')
  const [customType, setCustomType] = useState<'whatsapp' | 'email'>('whatsapp')
  const [sending, setSending] = useState(false)
  const [editing, setEditing] = useState(false)
  const [agent, setAgent] = useState<Agent>(initialAgent)

  useEffect(() => {
    fetch(`/api/templates?buyer_id=${initialAgent.id}`)
      .then(r => r.json()).then(d => setTemplates(d.templates || []))
    // Fetch full agent if only id was provided
    if (!initialAgent.name) {
      // Use settings endpoint which accepts buyer id via query
      fetch(`/api/settings?buyer_id=${initialAgent.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setAgent({ id: initialAgent.id, name: d.name, email: d.email, phone: d.phone }))
    }
  }, [initialAgent.id, initialAgent.name])

  const selected = templates.find(t => t.id === selectedId)
  const preview = selected ? renderTemplate(editing ? customBody : selected.body, lead, agent) : customBody
  const activeType = selected?.type || customType
  const canSend = activeType === 'whatsapp' ? !!lead.phone : !!lead.email

  async function send() {
    setSending(true)
    const r = await fetch('/api/templates/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: editing ? null : selectedId,
        override_body: editing || !selectedId ? preview : null,
        lead_id: lead.id,
        buyer_id: agent.id,
      }),
    })
    setSending(false)
    if (r.ok) {
      onSent?.()
      onClose()
    } else {
      const d = await r.json()
      alert(d.error || 'Erro ao enviar')
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 top-[5%] bottom-[5%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[680px] md:max-h-[90vh] z-[70] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          <div>
            <h2 className="text-[16px] font-extrabold text-white">Enviar mensagem pra {lead.name}</h2>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{lead.phone} · {lead.email}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10" style={{ color: '#fff' }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Template picker */}
          {!selectedId && !editing && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: '#94a3b8' }}>Escolha um template</p>
              <div className="space-y-2 mb-4">
                {templates.map(t => (
                  <button key={t.id} onClick={() => setSelectedId(t.id)}
                    className="w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors hover:bg-indigo-50/50"
                    style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
                    <span className="text-[18px]">{t.type === 'whatsapp' ? '💬' : '📧'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-bold" style={{ color: '#1a1a2e' }}>{t.name}</p>
                        {t.is_system && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: '#fef3c7', color: '#92400e' }}>Sistema</span>}
                      </div>
                      <p className="text-[11px] line-clamp-1" style={{ color: '#94a3b8' }}>{t.body}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => { setEditing(true); setCustomBody(''); setSelectedId(null) }}
                className="w-full py-3 rounded-xl text-[13px] font-bold"
                style={{ background: '#eef2ff', color: '#6366f1', border: '1px dashed #c7d2fe' }}>
                + Mensagem customizada
              </button>
            </div>
          )}

          {/* Preview + edit */}
          {(selected || editing) && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                    {editing ? 'Customizada' : selected?.name}
                  </p>
                  {!editing && (
                    <button onClick={() => { setEditing(true); setCustomBody(selected?.body || '') }}
                      className="text-[11px] font-bold" style={{ color: '#6366f1' }}>
                      ✎ Editar antes de enviar
                    </button>
                  )}
                </div>
                <button onClick={() => { setSelectedId(null); setEditing(false); setCustomBody('') }}
                  className="text-[11px] font-bold" style={{ color: '#94a3b8' }}>← Trocar template</button>
              </div>

              {editing && !selected && (
                <div className="mb-3">
                  <label className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: '#94a3b8' }}>Canal</label>
                  <div className="flex gap-2">
                    <button onClick={() => setCustomType('whatsapp')}
                      className="flex-1 py-2 rounded-lg text-[12px] font-bold"
                      style={{ background: customType === 'whatsapp' ? '#10b981' : '#f8f9fc', color: customType === 'whatsapp' ? '#fff' : '#64748b', border: '1px solid #e8ecf4' }}>
                      💬 WhatsApp
                    </button>
                    <button onClick={() => setCustomType('email')}
                      className="flex-1 py-2 rounded-lg text-[12px] font-bold"
                      style={{ background: customType === 'email' ? '#6366f1' : '#f8f9fc', color: customType === 'email' ? '#fff' : '#64748b', border: '1px solid #e8ecf4' }}>
                      📧 Email
                    </button>
                  </div>
                </div>
              )}

              {editing ? (
                <textarea value={customBody} onChange={e => setCustomBody(e.target.value)}
                  rows={8} placeholder="Digite sua mensagem. Use {primeiro_nome}, {nome}, etc."
                  className="w-full px-4 py-3 rounded-xl text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
              ) : (
                <div className="rounded-xl p-4 mb-2" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
                  <p className="text-[13px] whitespace-pre-wrap" style={{ color: '#1a1a2e' }}>{preview}</p>
                </div>
              )}

              {editing && preview && (
                <div className="mt-3 rounded-xl p-4" style={{ background: '#f0f4ff', border: '1px solid #e0e7ff' }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#6366f1' }}>Preview (variaveis substituidas)</p>
                  <p className="text-[13px] whitespace-pre-wrap" style={{ color: '#1a1a2e' }}>{preview}</p>
                </div>
              )}

              {!canSend && (
                <p className="text-[12px] mt-3 px-4 py-3 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                  ⚠️ {activeType === 'whatsapp' ? 'Lead sem telefone' : 'Lead sem email'} — nao e possivel enviar
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {(selected || editing) && (
          <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid #f1f5f9' }}>
            <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold" style={{ color: '#64748b' }}>Cancelar</button>
            <button onClick={send} disabled={sending || !canSend || !preview.trim()}
              className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: activeType === 'whatsapp' ? '#10b981' : '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
              {sending ? 'Enviando...' : `Enviar ${activeType === 'whatsapp' ? 'WhatsApp' : 'Email'} →`}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
