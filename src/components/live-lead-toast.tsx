'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  badge: string      // "novo lead exclusivo"
  interest: string   // "quer saber de seguro de vida"
  now: string        // "agora mesmo"
  minsAgo: string    // "há {n} min"
}

// Pools ilustrativos (social proof / FOMO, como em e-commerce). Nomes BR-friendly
// (comunidade brasileira nos EUA) + cidades/estados reais com presença forte.
const NAMES = [
  'Lídia M.', 'Carlos R.', 'Fernanda S.', 'Ricardo A.', 'Patrícia L.', 'Bruno T.',
  'Juliana C.', 'Marcos V.', 'Camila F.', 'Diego N.', 'Aline P.', 'Rafael D.',
  'Tatiane O.', 'Anderson L.', 'Vanessa M.', 'Eduardo S.', 'Priscila R.', 'Thiago B.',
]
const PLACES: [string, string][] = [
  ['Orlando', 'FL'], ['Pompano Beach', 'FL'], ['Deerfield Beach', 'FL'], ['Kissimmee', 'FL'],
  ['Newark', 'NJ'], ['Framingham', 'MA'], ['Boston', 'MA'], ['Everett', 'MA'], ['Worcester', 'MA'],
  ['Danbury', 'CT'], ['Bridgeport', 'CT'], ['Marietta', 'GA'], ['Atlanta', 'GA'],
  ['Houston', 'TX'], ['Austin', 'TX'], ['Mineola', 'NY'], ['Pompano', 'FL'],
]

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)] }
function initials(n: string): string { return n.split(' ').map(w => w[0]).join('').slice(0, 2) }

interface ToastData { name: string; city: string; st: string; ago: string; hue: number }

export function LiveLeadToast({ badge, interest, now, minsAgo }: Props) {
  const [toast, setToast] = useState<ToastData | null>(null)
  const [closed, setClosed] = useState(false)
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (closed) return
    let alive = true

    const show = () => {
      if (!alive) return
      const name = pick(NAMES)
      const [city, st] = pick(PLACES)
      const m = Math.floor(Math.random() * 4) // 0..3
      const ago = m === 0 ? now : minsAgo.replace('{n}', String(m))
      const hue = Math.floor(Math.random() * 360)
      setToast({ name, city, st, ago, hue })
      if (hideRef.current) clearTimeout(hideRef.current)
      hideRef.current = setTimeout(() => { if (alive) setToast(null) }, 6000)
    }

    const first = setTimeout(show, 6000)       // 1º após 6s
    const loop = setInterval(show, 15000)      // depois a cada ~15s
    return () => {
      alive = false
      clearTimeout(first)
      clearInterval(loop)
      if (hideRef.current) clearTimeout(hideRef.current)
    }
  }, [closed, now, minsAgo])

  if (closed || !toast) return null

  return (
    <>
      <style>{`@keyframes l4pToastIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
      <div
        className="fixed left-3 sm:left-4 bottom-3 sm:bottom-4 z-[55] w-[300px] max-w-[calc(100vw-24px)]"
        style={{ animation: 'l4pToastIn .45s cubic-bezier(.16,1,.3,1)' }}
        role="status"
        aria-live="polite"
      >
        <div className="rounded-2xl px-4 py-3 flex items-start gap-3" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 14px 44px rgba(15,23,42,0.2)' }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-extrabold text-white flex-shrink-0 relative" style={{ background: `hsl(${toast.hue}, 58%, 52%)` }}>
            {initials(toast.name)}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full" style={{ background: '#10b981', border: '2px solid #fff' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold leading-tight flex items-center gap-1.5 flex-wrap" style={{ color: '#1a1a2e' }}>
              {toast.name}
              <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: '#dcfce7', color: '#15803d' }}>🔥 {badge}</span>
            </p>
            <p className="text-[11.5px] mt-0.5 leading-snug" style={{ color: '#64748b' }}>
              🇺🇸 {toast.city}, {toast.st} · {interest}
            </p>
            <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: '#94a3b8' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#10b981' }} /> {toast.ago}
            </p>
          </div>
          <button onClick={() => setClosed(true)} aria-label="Fechar" className="text-[15px] leading-none p-1 -mt-1 -mr-1" style={{ color: '#cbd5e1' }}>×</button>
        </div>
      </div>
    </>
  )
}
