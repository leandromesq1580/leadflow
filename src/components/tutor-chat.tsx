'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n-client'

/**
 * 🤖 Tutor da plataforma — chatbot flutuante GLOBAL (todas as páginas do dashboard).
 * Ensina a plataforma passo a passo + coach de vendas + dúvidas de life insurance.
 * Backend: /api/training/chat. Linhas "👉 " da resposta viram chips clicáveis.
 */
export function TutorChat({ offsetBottom = 24 }: { offsetBottom?: number }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function ask(question?: string) {
    const q = (question ?? draft).trim()
    if (!q || busy) return
    setDraft('')
    const next: { role: 'user' | 'assistant'; content: string }[] = [...msgs, { role: 'user' as const, content: q }]
    setMsgs(next)
    setBusy(true)
    try {
      const r = await fetch('/api/training/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-12) }),
      })
      const d = await r.json().catch(() => ({}))
      setMsgs(m => [...m, { role: 'assistant', content: r.ok ? d.reply : (d.error || L('Deu ruim aqui — tenta de novo.', 'Something went wrong — try again.', 'Algo salió mal — inténtalo de nuevo.')) }])
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: L('Falha de conexão — tenta de novo.', 'Connection failed — try again.', 'Falla de conexión — inténtalo de nuevo.') }])
    }
    setBusy(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label={L('Pergunte à Zoe', 'Ask Zoe', 'Pregúntale a Zoe')}
        className="flex items-center gap-2.5 pl-1.5 pr-5 py-1.5 rounded-full text-[14px] font-bold text-white transition-all hover:shadow-xl"
        style={{ position: 'fixed', right: 20, bottom: offsetBottom, zIndex: 70, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)', border: 'none', cursor: 'pointer' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/zoe.jpg" alt="Zoe" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.85)', display: 'block' }} />
        Zoe
      </button>
    )
  }

  return (
    <div style={{ position: 'fixed', right: 20, bottom: offsetBottom, zIndex: 70, width: 'min(400px, calc(100vw - 32px))', height: `min(560px, calc(100vh - ${offsetBottom + 76}px))`, background: 'var(--bg-card)', border: '1px solid #e8ecf4', borderRadius: 18, boxShadow: '0 20px 60px rgba(15,23,42,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/zoe.jpg" alt="Zoe" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.35)', display: 'block' }} />
        <div className="flex-1">
          <p className="text-[14px] font-bold text-white m-0">Zoe · Lead4Pro</p>
          <p className="text-[11px] m-0" style={{ color: 'rgba(255,255,255,0.6)' }}>{L('Plataforma · atendimento · fechamento · life insurance', 'Platform · client care · closing · life insurance', 'Plataforma · atención · cierre · life insurance')}</p>
        </div>
        <button onClick={() => setOpen(false)} className="px-2.5 py-1 rounded-lg text-[13px] font-bold" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.length === 0 && (
          <div>
            <p className="text-[13px] mb-3" style={{ color: 'var(--fg-secondary)' }}>{L('Oi! 👋 Eu sou a', "Hi! 👋 I'm", '¡Hola! 👋 Soy')} <b>Zoe</b>{L(', sua tutora aqui no Lead4Pro. Pergunta como usar a plataforma, peça dicas de atendimento e fechamento, ou tire dúvidas de life insurance:', ', your tutor here at Lead4Pro. Ask how to use the platform, get tips on client care and closing, or ask your life insurance questions:', ', tu tutora aquí en Lead4Pro. Pregunta cómo usar la plataforma, pide consejos de atención y cierre, o resuelve tus dudas de life insurance:')}</p>
            {[
              L('Como fazer um bom primeiro atendimento?', 'How do I nail the first contact?', '¿Cómo hacer un buen primer contacto?'),
              L('Dicas pra fechar mais vendas 🔥', 'Tips to close more sales 🔥', 'Consejos para cerrar más ventas 🔥'),
              L('Como conecto meu WhatsApp?', 'How do I connect my WhatsApp?', '¿Cómo conecto mi WhatsApp?'),
              L('Como criar uma automação?', 'How do I create an automation?', '¿Cómo creo una automatización?'),
            ].map(s => (
              <button key={s} onClick={() => ask(s)}
                className="block w-full text-left px-3 py-2 mb-2 rounded-xl text-[13px] font-semibold transition-all hover:shadow-sm"
                style={{ background: 'var(--accent-light)', color: '#4f46e5', border: '1px solid #e0e7ff', cursor: 'pointer' }}>
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => {
          // Linhas "👉 " no fim da resposta viram chips clicáveis de próxima pergunta.
          const lines = m.content.split('\n')
          const sugs = m.role === 'assistant' ? lines.filter(l => l.trim().startsWith('👉')).map(l => l.trim().replace(/^👉\s*/, '')) : []
          const text = m.role === 'assistant' ? lines.filter(l => !l.trim().startsWith('👉')).join('\n').trim() : m.content
          return (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
              <div className="px-3.5 py-2.5 rounded-2xl text-[13.5px]" style={{
                background: m.role === 'user' ? '#6366f1' : 'var(--bg-soft)',
                color: m.role === 'user' ? '#fff' : '#1e293b',
                whiteSpace: 'pre-wrap', lineHeight: 1.55,
                borderBottomRightRadius: m.role === 'user' ? 6 : 16,
                borderBottomLeftRadius: m.role === 'user' ? 16 : 6,
              }}>{text}</div>
              {sugs.length > 0 && i === msgs.length - 1 && !busy && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {sugs.map((s, k) => (
                    <button key={k} onClick={() => ask(s)}
                      className="text-left px-3 py-2 rounded-xl text-[12.5px] font-semibold transition-all hover:shadow-sm"
                      style={{ background: 'var(--accent-light)', color: '#4f46e5', border: '1px solid #e0e7ff', cursor: 'pointer' }}>
                      👉 {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {busy && <div className="px-3.5 py-2.5 rounded-2xl text-[13px]" style={{ background: 'var(--bg-soft)', color: 'var(--fg-muted)', alignSelf: 'flex-start' }}>{L('Zoe está digitando…', 'Zoe is typing…', 'Zoe está escribiendo…')}</div>}
      </div>
      <div className="flex gap-2 p-3" style={{ borderTop: '1px solid #e8ecf4' }}>
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') ask() }}
          placeholder={L('Como faço pra…?', 'How do I…?', '¿Cómo hago para…?')}
          className="flex-1 px-3.5 py-2.5 rounded-xl text-[13.5px] outline-none"
          style={{ border: '1px solid #e8ecf4', background: 'var(--bg-soft)', color: '#1e293b' }} />
        <button onClick={() => ask()} disabled={busy || !draft.trim()}
          className="px-4 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: '#6366f1', border: 'none', cursor: 'pointer' }}>➤</button>
      </div>
    </div>
  )
}
