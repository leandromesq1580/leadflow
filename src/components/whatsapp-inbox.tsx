'use client'

import { useState, useEffect, useRef } from 'react'

interface Message {
  id: string
  direction: 'in' | 'out'
  body: string | null
  from_phone: string
  to_phone: string
  sent_at: string
  status: string
  read_at: string | null
}

interface Props {
  leadId: string
  buyerId: string
}

export function WhatsAppInbox({ leadId, buyerId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    load()
    // Mark as read on mount
    fetch('/api/whatsapp/messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    }).catch(() => {})

    // Poll every 10s
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [leadId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function load() {
    const r = await fetch(`/api/whatsapp/messages?lead_id=${leadId}`)
    if (r.ok) {
      const d = await r.json()
      setMessages(d.messages || [])
    }
    setLoading(false)
  }

  async function send() {
    if (!text.trim() || sending) return
    setSending(true)
    const r = await fetch('/api/whatsapp/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, buyer_id: buyerId, body: text.trim() }),
    })
    setSending(false)
    if (r.ok) {
      setText('')
      await load()
    } else {
      const d = await r.json()
      alert(d.error || 'Erro ao enviar')
    }
  }

  function fmtTime(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  }

  if (loading) return <div className="text-[12px] p-4" style={{ color: '#94a3b8' }}>Carregando conversa...</div>

  return (
    <div className="flex flex-col rounded-xl overflow-hidden" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', height: 420 }}>
      {/* Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <p className="text-[40px] mb-2">💬</p>
            <p className="text-[13px]" style={{ color: '#94a3b8' }}>Nenhuma mensagem ainda</p>
            <p className="text-[11px] mt-1" style={{ color: '#cbd5e1' }}>Envie a primeira mensagem abaixo</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[80%] px-3 py-2 rounded-2xl"
              style={{
                background: m.direction === 'out' ? '#dcf8c6' : '#fff',
                border: m.direction === 'in' ? '1px solid #e8ecf4' : 'none',
                borderBottomRightRadius: m.direction === 'out' ? 4 : 16,
                borderBottomLeftRadius: m.direction === 'in' ? 4 : 16,
              }}>
              <p className="text-[13px] whitespace-pre-wrap break-words" style={{ color: '#1a1a2e' }}>{m.body}</p>
              <p className="text-[9px] mt-0.5 text-right" style={{ color: '#94a3b8' }}>
                {fmtTime(m.sent_at)} {m.direction === 'out' && (m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓')}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="p-3 flex gap-2" style={{ background: '#fff', borderTop: '1px solid #e8ecf4' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Digite uma mensagem..."
          rows={2}
          className="flex-1 px-3 py-2 rounded-xl text-[13px] resize-none focus:outline-none"
          style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }}
        />
        <button onClick={send} disabled={!text.trim() || sending}
          className="px-4 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)', minWidth: 60 }}>
          {sending ? '...' : '➤'}
        </button>
      </div>
    </div>
  )
}
