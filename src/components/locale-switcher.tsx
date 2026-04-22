'use client'

import { useState, useRef, useEffect } from 'react'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n'

function setLocaleCookie(locale: Locale) {
  // 1 ano, path /, SameSite=Lax pra acompanhar navegacao
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${365 * 24 * 3600}; SameSite=Lax`
}

export function LocaleSwitcher({ current }: { current: Locale }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function choose(l: Locale) {
    setLocaleCookie(l)
    setOpen(false)
    // Hard reload pra o server re-renderizar com o novo locale
    window.location.reload()
  }

  const meta = LOCALE_META[current]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors hover:bg-slate-100"
        style={{ color: '#64748b' }}
        aria-label="Change language"
      >
        <span>{meta.flag}</span>
        <span>{meta.short}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 rounded-xl overflow-hidden z-50 min-w-[140px]"
          style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
          {LOCALES.map(l => {
            const m = LOCALE_META[l]
            const isActive = l === current
            return (
              <button
                key={l}
                onClick={() => choose(l)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] font-semibold transition-colors"
                style={{
                  background: isActive ? '#eef2ff' : 'transparent',
                  color: isActive ? '#6366f1' : '#1a1a2e',
                }}
              >
                <span className="text-[16px]">{m.flag}</span>
                <span className="flex-1">{m.name}</span>
                {isActive && <span className="text-[11px]">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
