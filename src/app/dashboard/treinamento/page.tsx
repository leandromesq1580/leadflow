'use client'

import { useEffect, useMemo, useState } from 'react'
import { TRAINING_MODULES, type TrainingVideo } from '@/lib/training-content'

/**
 * 🎓 Treinamento — curso da plataforma organizado por TEMAS (módulos curados).
 * Player embutido (Drive /preview). Enquanto os módulos não são preenchidos,
 * cai na lista automática da pasta (fallback), e sem nada mostra "em preparação".
 */
export default function TreinamentoPage() {
  const [autoVideos, setAutoVideos] = useState<TrainingVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [playing, setPlaying] = useState<TrainingVideo | null>(null)
  const [broken, setBroken] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState<Record<string, boolean>>({})

  // 🤖 Tutor da plataforma
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMsgs, setChatMsgs] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [chatBusy, setChatBusy] = useState(false)

  const hasCurated = TRAINING_MODULES.some(m => m.videos.length > 0)
  const curatedIds = useMemo(() => new Set(TRAINING_MODULES.flatMap(m => m.videos.map(v => v.id))), [])

  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem('l4p_training_done') || '{}')) } catch {}
    // Busca a pasta sempre: vídeo novo que ainda não está em módulo vira "Novas aulas".
    fetch('/api/training', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        setAutoVideos((d.videos || []).map((v: any) => ({ id: v.id, title: v.name })))
        setIsAdmin(!!d.isAdmin)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const extras = useMemo(() => autoVideos.filter(v => !curatedIds.has(v.id)), [autoVideos, curatedIds])

  async function askTutor(question?: string) {
    const q = (question ?? chatDraft).trim()
    if (!q || chatBusy) return
    setChatDraft('')
    const next: { role: 'user' | 'assistant'; content: string }[] = [...chatMsgs, { role: 'user' as const, content: q }]
    setChatMsgs(next)
    setChatBusy(true)
    try {
      const r = await fetch('/api/training/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-12) }),
      })
      const d = await r.json().catch(() => ({}))
      setChatMsgs(m => [...m, { role: 'assistant', content: r.ok ? d.reply : (d.error || 'Deu ruim aqui — tenta de novo.') }])
    } catch {
      setChatMsgs(m => [...m, { role: 'assistant', content: 'Falha de conexão — tenta de novo.' }])
    }
    setChatBusy(false)
  }

  function markDone(id: string) {
    setDone(prev => {
      const next = { ...prev, [id]: true }
      try { localStorage.setItem('l4p_training_done', JSON.stringify(next)) } catch {}
      return next
    })
  }

  const totalLessons = useMemo(
    () => (hasCurated ? TRAINING_MODULES.reduce((a, m) => a + m.videos.length, 0) + extras.length : autoVideos.length),
    [hasCurated, autoVideos, extras],
  )
  const doneCount = useMemo(() => {
    const ids = hasCurated ? [...TRAINING_MODULES.flatMap(m => m.videos.map(v => v.id)), ...extras.map(v => v.id)] : autoVideos.map(v => v.id)
    return ids.filter(id => done[id]).length
  }, [hasCurated, autoVideos, extras, done])

  const card = (v: TrainingVideo, idx: number) => (
    <button key={v.id} onClick={() => { setPlaying(v); markDone(v.id) }} className="text-left rounded-2xl overflow-hidden transition-all hover:shadow-lg"
      style={{ background: '#fff', border: done[v.id] ? '1.5px solid #10b981' : '1px solid #e8ecf4', cursor: 'pointer', padding: 0 }}>
      <div style={{ position: 'relative', aspectRatio: '16/9', background: 'linear-gradient(135deg, #1e1b4b, #312e81)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!broken[v.id] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`https://drive.google.com/thumbnail?id=${v.id}&sz=w640`} alt="" loading="lazy"
            onError={() => setBroken(b => ({ ...b, [v.id]: true }))}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <span style={{ fontSize: 42 }}>🎬</span>
        )}
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(15,23,42,0.72)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, paddingLeft: 4 }}>▶</span>
        </span>
        {done[v.id] && <span style={{ position: 'absolute', top: 8, right: 8, background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }}>✓ assistida</span>}
      </div>
      <div className="p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#94a3b8' }}>Aula {idx + 1}</p>
        <p className="text-[14px] font-bold leading-snug" style={{ color: '#1a1a2e' }}>{v.title}</p>
      </div>
    </button>
  )

  return (
    <div className="max-w-[1040px]">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>🎓 Treinamento</h1>
      <p className="text-[14px] mb-2" style={{ color: '#64748b' }}>Aprenda a plataforma por temas — vídeos curtos e direto ao ponto.</p>
      {totalLessons > 0 && (
        <p className="text-[12px] mb-6 font-semibold" style={{ color: doneCount === totalLessons ? '#059669' : '#94a3b8' }}>
          {doneCount}/{totalLessons} aulas assistidas{doneCount === totalLessons ? ' — curso completo! 🎉' : ''}
        </p>
      )}

      {loading ? (
        <p className="text-[13px]" style={{ color: '#94a3b8' }}>Carregando aulas…</p>
      ) : hasCurated ? (
        <>
          {TRAINING_MODULES.filter(m => m.videos.length > 0).map(m => (
            <div key={m.key} className="mb-8">
              <h2 className="text-[17px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>{m.icon} {m.title}</h2>
              <p className="text-[13px] mb-4" style={{ color: '#64748b' }}>{m.desc}</p>
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {m.videos.map((v, i) => card(v, i))}
              </div>
            </div>
          ))}
          {extras.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[17px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>🆕 Novas aulas</h2>
              <p className="text-[13px] mb-4" style={{ color: '#64748b' }}>Acabaram de chegar — em breve entram num módulo.</p>
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {extras.map((v, i) => card(v, i))}
              </div>
            </div>
          )}
        </>
      ) : autoVideos.length > 0 ? (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {autoVideos.map((v, i) => card(v, i))}
        </div>
      ) : (
        <div className="rounded-2xl p-8 text-center" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[15px] font-bold mb-1" style={{ color: '#1a1a2e' }}>📹 Aulas em preparação</p>
          <p className="text-[13px]" style={{ color: '#64748b' }}>Os vídeos de treinamento estão sendo organizados por tema — volta em breve!</p>
          {isAdmin && <p className="text-[12px] mt-3" style={{ color: '#94a3b8' }}>(admin: os módulos são preenchidos em src/lib/training-content.ts a partir da pasta do Drive)</p>}
        </div>
      )}

      {/* 🤖 Tutor da plataforma — botão flutuante + painel */}
      {!chatOpen && (
        <button onClick={() => setChatOpen(true)}
          className="flex items-center gap-2 px-5 py-3.5 rounded-full text-[14px] font-bold text-white transition-all hover:shadow-xl"
          style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 70, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 8px 24px rgba(99,102,241,0.4)', border: 'none', cursor: 'pointer' }}>
          🤖 Pergunte ao Tutor
        </button>
      )}
      {chatOpen && (
        <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 70, width: 'min(400px, calc(100vw - 32px))', height: 'min(560px, calc(100vh - 100px))', background: '#fff', border: '1px solid #e8ecf4', borderRadius: 18, boxShadow: '0 20px 60px rgba(15,23,42,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)' }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-white m-0">Tutor da plataforma</p>
              <p className="text-[11px] m-0" style={{ color: 'rgba(255,255,255,0.6)' }}>Pergunta como fazer, eu explico passo a passo</p>
            </div>
            <button onClick={() => setChatOpen(false)} className="px-2.5 py-1 rounded-lg text-[13px] font-bold" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chatMsgs.length === 0 && (
              <div>
                <p className="text-[13px] mb-3" style={{ color: '#64748b' }}>Oi! 👋 Sou o tutor do Lead4Pro. Me pergunta qualquer coisa sobre a plataforma — por exemplo:</p>
                {['Como fazer um bom primeiro atendimento?', 'Dicas pra fechar mais vendas 🔥', 'Como conecto meu WhatsApp?', 'Como criar uma automação?'].map(s => (
                  <button key={s} onClick={() => askTutor(s)}
                    className="block w-full text-left px-3 py-2 mb-2 rounded-xl text-[13px] font-semibold transition-all hover:shadow-sm"
                    style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #e0e7ff', cursor: 'pointer' }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {chatMsgs.map((m, i) => {
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
                  {sugs.length > 0 && i === chatMsgs.length - 1 && !chatBusy && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      {sugs.map((s, k) => (
                        <button key={k} onClick={() => askTutor(s)}
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
            {chatBusy && <div className="px-3.5 py-2.5 rounded-2xl text-[13px]" style={{ background: '#f1f5f9', color: '#94a3b8', alignSelf: 'flex-start' }}>digitando…</div>}
          </div>
          <div className="flex gap-2 p-3" style={{ borderTop: '1px solid #e8ecf4' }}>
            <input value={chatDraft} onChange={e => setChatDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') askTutor() }}
              placeholder="Como faço pra…?"
              className="flex-1 px-3.5 py-2.5 rounded-xl text-[13.5px] outline-none"
              style={{ border: '1px solid #e8ecf4', background: '#f8fafc', color: '#1e293b' }} />
            <button onClick={() => askTutor()} disabled={chatBusy || !chatDraft.trim()}
              className="px-4 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: '#6366f1', border: 'none', cursor: 'pointer' }}>➤</button>
          </div>
        </div>
      )}

      {playing && (
        <div onClick={() => setPlaying(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 960 }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[15px] font-bold text-white truncate pr-4">{playing.title}</p>
              <button onClick={() => setPlaying(null)} className="px-3 py-1.5 rounded-lg text-[13px] font-bold" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>✕ Fechar</button>
            </div>
            <div style={{ aspectRatio: '16/9', background: '#000', borderRadius: 12, overflow: 'hidden' }}>
              <iframe
                src={`https://drive.google.com/file/d/${playing.id}/preview`}
                allow="autoplay; fullscreen"
                allowFullScreen
                style={{ width: '100%', height: '100%', border: 0 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
