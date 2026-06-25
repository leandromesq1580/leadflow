'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'

interface Msg { id?: string; role: 'user' | 'assistant'; text: string }

export default function MobileAI() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const router = useRouter()

  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/ai-consult', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => setMsgs(d?.messages || [])).catch(() => setMsgs([]))
  }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'auto' }) }, [msgs?.length, sending])

  const SUGGESTIONS = [
    L('Como quebrar a objeção de preço?', 'How to handle the price objection?', '¿Cómo romper la objeción de precio?'),
    L('Me dá um script de primeira ligação', 'Give me a first-call script', 'Dame un guion de primera llamada'),
    L('Como abordar um lead frio?', 'How to approach a cold lead?', '¿Cómo abordar un lead frío?'),
  ]

  async function send(q?: string) {
    const message = (q ?? text).trim()
    if (!message || sending) return
    setMsgs(prev => [...(prev || []), { role: 'user', text: message }])
    setText(''); setSending(true); setErr('')
    try {
      const r = await fetch('/api/ai-consult', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || L('Não consegui responder agora.', "Couldn't answer now.", 'No pude responder.')); setSending(false); return }
      setMsgs(prev => [...(prev || []), { role: 'assistant', text: d.reply }])
    } catch { setErr(L('Demorou demais. Tente de novo.', 'Timed out. Try again.', 'Tardó demasiado.')) }
    setSending(false)
  }

  async function reset() {
    if (!confirm(L('Começar uma nova conversa?', 'Start a new conversation?', '¿Nueva conversación?'))) return
    try { await fetch('/api/ai-consult', { method: 'DELETE' }) } catch {}
    setMsgs([]); setErr('')
  }

  const empty = msgs && msgs.length === 0 && !sending

  return (
    <div>
      <div className="m-chat-head">
        <button onClick={() => router.push('/m/mais')} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="arrowLeft" size={24} /></button>
        <div className="m-icb" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' }}><MIcon name="robot" size={18} /></div>
        <p style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 700 }}>{L('Especialista AI', 'AI Specialist', 'Especialista IA')}</p>
        <button onClick={reset} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-faint)', display: 'flex', cursor: 'pointer', padding: 0 }} aria-label={L('Nova conversa', 'New chat', 'Nueva')}><MIcon name="refresh" size={20} /></button>
      </div>

      <div className="m-pad" style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 14, paddingBottom: 96, minHeight: '40vh' }}>
        {!msgs && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><div className="m-spin" /></div>}

        {empty && (
          <div style={{ paddingTop: 10 }}>
            <div className="m-bubble m-bubble-in" style={{ maxWidth: '90%' }}>{L('Oi! Sou seu especialista em seguros. Posso ajudar com objeções, scripts de ligação, dúvidas de produto e como abordar cada lead.', "Hi! I'm your insurance specialist. I can help with objections, call scripts, product questions and how to approach each lead.", '¡Hola! Soy tu especialista en seguros.')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {SUGGESTIONS.map((s, i) => <span key={i} className="m-chip m-tap" onClick={() => send(s)}>{s}</span>)}
            </div>
          </div>
        )}

        {(msgs || []).map((m, i) => (
          <div key={i} className={`m-bubble ${m.role === 'user' ? 'm-bubble-out' : 'm-bubble-in'}`} style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
        ))}

        {sending && (
          <div className="m-bubble m-bubble-in" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="m-spin" style={{ width: 16, height: 16, borderWidth: 2 }} /><span className="m-muted" style={{ fontSize: 13 }}>{L('Pensando…', 'Thinking…', 'Pensando…')}</span>
          </div>
        )}
        {err && <p style={{ color: '#fca5a5', fontSize: 12, textAlign: 'center' }}>{err}</p>}
        <div ref={endRef} />
      </div>

      <div className="m-composer">
        <input className="m-input" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder={sending ? L('Aguarde a resposta…', 'Wait for the reply…', 'Espera…') : L('Pergunte ao especialista…', 'Ask the specialist…', 'Pregunta…')} disabled={sending} style={{ height: 44, flex: 1, opacity: sending ? 0.6 : 1 }} />
        <button onClick={() => send()} disabled={sending || !text.trim()} className="m-send-btn m-tap" style={{ opacity: sending || !text.trim() ? 0.5 : 1 }} aria-label={L('Enviar', 'Send', 'Enviar')}><MIcon name="send" size={19} /></button>
      </div>
    </div>
  )
}
