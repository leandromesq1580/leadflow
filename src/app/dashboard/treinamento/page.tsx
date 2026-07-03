'use client'

import { useEffect, useState } from 'react'

type Video = { id: string; name: string }

/**
 * 🎓 Treinamento — vídeos da plataforma, lidos da pasta do Google Drive.
 * Player embutido (iframe /preview); vídeo novo na pasta aparece sozinho.
 */
export default function TreinamentoPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [needsPublic, setNeedsPublic] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [folderUrl, setFolderUrl] = useState('')
  const [playing, setPlaying] = useState<Video | null>(null)
  const [broken, setBroken] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch('/api/training', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        setVideos(d.videos || [])
        setNeedsPublic(!!d.needsPublic)
        setIsAdmin(!!d.isAdmin)
        setFolderUrl(d.folderUrl || '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-[1040px]">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>🎓 Treinamento</h1>
      <p className="text-[14px] mb-6" style={{ color: '#64748b' }}>Aprenda a usar a plataforma no seu ritmo — vídeos curtos e direto ao ponto.</p>

      {loading ? (
        <p className="text-[13px]" style={{ color: '#94a3b8' }}>Carregando vídeos…</p>
      ) : needsPublic ? (
        <div className="rounded-2xl p-6" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
          {isAdmin ? (
            <>
              <p className="text-[15px] font-bold mb-2" style={{ color: '#92400e' }}>⚠️ A pasta do Drive está privada</p>
              <p className="text-[13px] mb-3" style={{ color: '#78350f', lineHeight: 1.6 }}>
                Pra os vídeos aparecerem aqui pra todo mundo: abra a pasta no Drive → botão <b>Compartilhar</b> → em <b>Acesso geral</b>, troque para <b>“Qualquer pessoa com o link”</b> (Leitor) → Concluído. Depois recarregue esta página.
              </p>
              <a href={folderUrl} target="_blank" rel="noopener noreferrer" className="inline-block px-4 py-2 rounded-xl text-[13px] font-bold text-white" style={{ background: '#f59e0b' }}>Abrir a pasta no Drive</a>
            </>
          ) : (
            <p className="text-[14px]" style={{ color: '#92400e' }}>📹 Os vídeos de treinamento estão em preparação — volte em breve!</p>
          )}
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-2xl p-6 text-center" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[14px] mb-2" style={{ color: '#64748b' }}>Nenhum vídeo encontrado ainda.</p>
          {isAdmin && folderUrl && (
            <a href={folderUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold" style={{ color: '#6366f1' }}>Abrir a pasta no Drive →</a>
          )}
        </div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {videos.map((v, i) => (
            <button key={v.id} onClick={() => setPlaying(v)} className="text-left rounded-2xl overflow-hidden transition-all hover:shadow-lg"
              style={{ background: '#fff', border: '1px solid #e8ecf4', cursor: 'pointer', padding: 0 }}>
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
              </div>
              <div className="p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#94a3b8' }}>Aula {i + 1}</p>
                <p className="text-[14px] font-bold leading-snug" style={{ color: '#1a1a2e' }}>{v.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {playing && (
        <div onClick={() => setPlaying(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 960 }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[15px] font-bold text-white truncate pr-4">{playing.name}</p>
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
