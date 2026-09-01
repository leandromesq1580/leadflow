'use client'

import { useState, useRef, useEffect } from 'react'
import { LOCALES, LOCALE_META, type Locale } from '@/lib/i18n'

function setLocaleCookie(locale: Locale) {
  // 1 ano, path /, SameSite=Lax pra acompanhar navegacao
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${365 * 24 * 3600}; SameSite=Lax`
}

type LocaleSwitcherVariant = 'compact' | 'topbar' | 'mobile'

export function LocaleSwitcher({ current, variant = 'compact' }: { current: Locale; variant?: LocaleSwitcherVariant }) {
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
  const prominent = variant !== 'compact'
  const languageLabel = current === 'en' ? 'Language' : 'Idioma'
  const changeLabel = current === 'pt' ? 'Trocar idioma' : current === 'en' ? 'Change language' : 'Cambiar idioma'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-xl text-[12px] font-bold transition-transform hover:scale-[1.02]"
        style={{
          color: prominent ? 'var(--fg)' : 'var(--fg-secondary)',
          padding: prominent ? (variant === 'mobile' ? '7px 9px' : '8px 11px') : '6px 12px',
          background: prominent ? 'var(--bg-card)' : 'transparent',
          border: prominent ? '1px solid var(--border)' : '1px solid transparent',
          boxShadow: prominent ? '0 2px 8px rgba(15,23,42,0.08)' : 'none',
        }}
        aria-label={changeLabel}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {prominent && <span aria-hidden="true">🌐</span>}
        {variant !== 'mobile' && <span>{meta.flag}</span>}
        {prominent && <span>{languageLabel}</span>}
        <span style={{ color: prominent ? 'var(--accent)' : 'inherit' }}>{variant === 'topbar' ? meta.name : meta.short}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 rounded-xl overflow-hidden z-50 min-w-[140px]"
          role="menu"
          aria-label={changeLabel}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
          {LOCALES.map(l => {
            const m = LOCALE_META[l]
            const isActive = l === current
            return (
              <button
                key={l}
                type="button"
                onClick={() => choose(l)}
                role="menuitemradio"
                aria-checked={isActive}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] font-semibold transition-colors"
                style={{
                  background: isActive ? 'var(--accent-light)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--fg)',
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
