'use client'

import { useState } from 'react'

/**
 * 🤖 Tutor da plataforma — chatbot flutuante GLOBAL (todas as páginas do dashboard).
 * Ensina a plataforma passo a passo + coach de vendas + dúvidas de life insurance.
 * Backend: /api/training/chat. Linhas "👉 " da resposta viram chips clicáveis.
 */
export function TutorChat({ offsetBottom = 24 }: { offsetBottom?: number }) {
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
      setMsgs(m => [...m, { role: 'assistant', content: r.ok ? d.reply : (d.error || 'Deu ruim aqui — tenta de novo.') }])
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: 'Falha de conexão — tenta de novo.' }])
    }
    setBusy(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Pergunte ao Tutor"
        className="flex items-center gap-2 px-5 py-3.5 rounded-full text-[14px] font-bold text-white transition-all hover:shadow-xl"
        style={{ position: 'fixed', right: 20, bottom: offsetBottom, zIndex: 70, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)', border: 'none', cursor: 'pointer' }}>
        🤖 Tutor
      </button>
    )
  }

  return (
    <div style={{ position: 'fixed', right: 20, bottom: offsetBottom, zIndex: 70, width: 'min(400px, calc(100vw - 32px))', height: `min(560px, calc(100vh - ${offsetBottom + 76}px))`, background: '#fff', border: '1px solid #e8ecf4', borderRadius: 18, boxShadow: '0 20px 60px rgba(15,23,42,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)' }}>
        <span style={{ fontSize: 20 }}>🤖</span>
        <div className="flex-1">
          <p className="text-[14px] font-bold text-white m-0">Tutor da plataforma</p>
          <p className="text-[11px] m-0" style={{ color: 'rgba(255,255,255,0.6)' }}>Plataforma · atendimento · fechamento · life insurance</p>
        </div>
        <button onClick={() => setOpen(false)} className="px-2.5 py-1 rounded-lg text-[13px] font-bold" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.length === 0 && (
          <div>
            <p className="text-[13px] mb-3" style={{ color: '#64748b' }}>Oi! 👋 Sou o tutor do Lead4Pro. Pergunta como usar a plataforma, peça dicas de atendimento e fechamento, ou tire dúvidas de life insurance:</p>
            {['Como fazer um bom primeiro atendimento?', 'Dicas pra fechar mais vendas 🔥', 'Como conecto meu WhatsApp?', 'Como criar uma automação?'].map(s => (
              <button key={s} onClick={() => ask(s)}
                className="block w-full text-left px-3 py-2 mb-2 rounded-xl text-[13px] font-semibold transition-all hover:shadow-sm"
                style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #e0e7ff', cursor: 'pointer' }}>
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
                background: m.role === 'user' ? '#6366f1' : '#f1f5f9',
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
                      style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #e0e7ff', cursor: 'pointer' }}>
                      👉 {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {busy && <div className="px-3.5 py-2.5 rounded-2xl text-[13px]" style={{ background: '#f1f5f9', color: '#94a3b8', alignSelf: 'flex-start' }}>digitando…</div>}
      </div>
      <div className="flex gap-2 p-3" style={{ borderTop: '1px solid #e8ecf4' }}>
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') ask() }}
          placeholder="Como faço pra…?"
          className="flex-1 px-3.5 py-2.5 rounded-xl text-[13.5px] outline-none"
          style={{ border: '1px solid #e8ecf4', background: '#f8fafc', color: '#1e293b' }} />
        <button onClick={() => ask()} disabled={busy || !draft.trim()}
          className="px-4 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: '#6366f1', border: 'none', cursor: 'pointer' }}>➤</button>
      </div>
    </div>
  )
}
