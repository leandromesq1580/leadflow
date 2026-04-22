'use client'

import { useEffect, useRef, useState } from 'react'

interface Msg {
  id: string
  role: 'user' | 'assistant'
  text: string
  created_at?: number
}

const SUGGESTIONS = [
  'Quais são os produtos de life insurance mais vendidos nos EUA?',
  'Cliente tem pressão alta: quais options?',
  'Explica a diferença entre term life e whole life.',
  'Como abordar um lead pela primeira vez no WhatsApp?',
  'Cliente não domina inglês: como explicar indexed universal life?',
]

export default function AiConsultPage() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadHistory()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, sending])

  async function loadHistory() {
    setLoading(true)
    try {
      const r = await fetch('/api/ai-consult')
      const d = await r.json()
      setMessages((d.messages || []) as Msg[])
    } catch {}
    setLoading(false)
  }

  async function send(text: string) {
    if (!text.trim() || sending) return
    setError(null)
    const userMsg: Msg = { id: `temp-${Date.now()}`, role: 'user', text: text.trim() }
    setMessages(m => [...m, userMsg])
    setInput('')
    setSending(true)
    try {
      const r = await fetch('/api/ai-consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Erro ao consultar')
      const aiMsg: Msg = { id: `ai-${Date.now()}`, role: 'assistant', text: d.reply || '' }
      setMessages(m => [...m, aiMsg])
    } catch (e) {
      setError((e as Error)?.message || 'Falha')
    } finally {
      setSending(false)
    }
  }

  async function resetThread() {
    if (!confirm('Começar nova conversa? O histórico atual será perdido.')) return
    await fetch('/api/ai-consult', { method: 'DELETE' })
    setMessages([])
    setError(null)
  }

  return (
    <div className="max-w-[900px] mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[22px]">🤖</span>
            <h1 className="text-[22px] font-extrabold" style={{ color: '#1a1a2e' }}>
              Especialista em Life Insurance
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold" style={{ background: '#eef2ff', color: '#6366f1' }}>AI</span>
          </div>
          <p className="text-[13px] mt-1" style={{ color: '#94a3b8' }}>
            Tire dúvidas sobre produtos, underwriting, abordagem de cliente, objeções e mais.
          </p>
        </div>
        {messages.length > 0 && (
          <button onClick={resetThread}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
            style={{ background: '#fee2e2', color: '#dc2626' }}>
            Nova conversa
          </button>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: '#fff', border: '1px solid #e8ecf4', height: 'calc(100vh - 220px)', minHeight: 500 }}>
        {/* Thread */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <p className="text-center text-[13px]" style={{ color: '#94a3b8' }}>Carregando...</p>
          ) : messages.length === 0 ? (
            <div>
              <div className="text-center py-8">
                <p className="text-[32px] mb-2">💡</p>
                <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>Como posso ajudar hoje?</p>
                <p className="text-[12px] mt-1 max-w-md mx-auto" style={{ color: '#94a3b8' }}>
                  Pergunte sobre produtos, como abordar leads, objeções comuns, underwriting — o que precisar.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto mt-6">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => send(s)}
                    className="text-left px-4 py-3 rounded-xl text-[13px] transition-all hover:-translate-y-0.5"
                    style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#475569' }}>
                    💬 {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${m.role === 'user' ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
                  style={{
                    background: m.role === 'user'
                      ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                      : '#f8fafc',
                    color: m.role === 'user' ? '#fff' : '#1a1a2e',
                    border: m.role === 'assistant' ? '1px solid #e8ecf4' : 'none',
                  }}>
                  {m.role === 'assistant' && (
                    <p className="text-[10px] font-extrabold uppercase tracking-wider mb-1.5" style={{ color: '#6366f1' }}>
                      🤖 Especialista
                    </p>
                  )}
                  <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{m.text}</p>
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2" style={{ background: '#f8fafc', border: '1px solid #e8ecf4' }}>
                <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: '#6366f1' }} />
                <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: '#6366f1', animationDelay: '150ms' }} />
                <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: '#6366f1', animationDelay: '300ms' }} />
                <span className="text-[12px] ml-1" style={{ color: '#94a3b8' }}>Pensando...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-3 mb-2 px-3 py-2 rounded-lg flex items-start gap-2" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <span className="text-[14px]">⚠️</span>
            <p className="flex-1 text-[12px] font-semibold" style={{ color: '#991b1b' }}>{error}</p>
            <button onClick={() => setError(null)} className="text-[14px] leading-none" style={{ color: '#991b1b' }}>×</button>
          </div>
        )}

        {/* Composer */}
        <div className="p-3" style={{ borderTop: '1px solid #e8ecf4', background: '#fff' }}>
          <form onSubmit={e => { e.preventDefault(); send(input) }} className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
              }}
              placeholder="Pergunte sobre produtos, objeções, underwriting..."
              rows={1}
              disabled={sending}
              className="flex-1 px-4 py-3 rounded-xl text-[13.5px] resize-none max-h-32 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              style={{ background: '#f8fafc', border: '1px solid #e8ecf4', color: '#1a1a2e' }}
            />
            <button type="submit" disabled={!input.trim() || sending}
              className="px-5 py-3 rounded-xl text-[13px] font-bold text-white disabled:opacity-50 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
              {sending ? '...' : 'Enviar'}
            </button>
          </form>
          <p className="text-[10px] mt-2 text-center" style={{ color: '#c0c8d4' }}>
            Enter pra enviar · Shift+Enter pra pular linha · Respostas da IA podem conter erros — sempre confirme com a seguradora
          </p>
        </div>
      </div>
    </div>
  )
}
