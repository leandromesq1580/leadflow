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

  const hasCurated = TRAINING_MODULES.some(m => m.videos.length > 0)

  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem('l4p_training_done') || '{}')) } catch {}
    if (hasCurated) { setLoading(false); return }
    fetch('/api/training', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        setAutoVideos((d.videos || []).map((v: any) => ({ id: v.id, title: v.name })))
        setIsAdmin(!!d.isAdmin)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [hasCurated])

  function markDone(id: string) {
    setDone(prev => {
      const next = { ...prev, [id]: true }
      try { localStorage.setItem('l4p_training_done', JSON.stringify(next)) } catch {}
      return next
    })
  }

  const totalLessons = useMemo(
    () => (hasCurated ? TRAINING_MODULES.reduce((a, m) => a + m.videos.length, 0) : autoVideos.length),
    [hasCurated, autoVideos],
  )
  const doneCount = useMemo(() => {
    const ids = hasCurated ? TRAINING_MODULES.flatMap(m => m.videos.map(v => v.id)) : autoVideos.map(v => v.id)
    return ids.filter(id => done[id]).length
  }, [hasCurated, autoVideos, done])

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
        TRAINING_MODULES.filter(m => m.videos.length > 0).map(m => (
          <div key={m.key} className="mb-8">
            <h2 className="text-[17px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>{m.icon} {m.title}</h2>
            <p className="text-[13px] mb-4" style={{ color: '#64748b' }}>{m.desc}</p>
            <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {m.videos.map((v, i) => card(v, i))}
            </div>
          </div>
        ))
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
