'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n-client'

/**
 * Toggle claro/escuro (reconcept Fase 2). Grava em data-theme no <html>, no
 * localStorage E num cookie — o cookie deixa o servidor renderizar já no tema
 * certo (zero flash de tela branca pra quem usa escuro).
 */
export function ThemeToggle() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [escuro, setEscuro] = useState<boolean | null>(null)

  useEffect(() => {
    setEscuro(document.documentElement.dataset.theme === 'dark')
  }, [])

  function alternar() {
    const novo = !escuro
    setEscuro(novo)
    document.documentElement.dataset.theme = novo ? 'dark' : 'light'
    try {
      localStorage.setItem('l4p-theme', novo ? 'dark' : 'light')
      document.cookie = `l4p-theme=${novo ? 'dark' : 'light'}; path=/; max-age=31536000; SameSite=Lax`
    } catch {}
  }

  if (escuro === null) return null
  return (
    <button onClick={alternar}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-[15px] transition-transform hover:scale-110"
      style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)' }}
      title={escuro ? L('Tema claro', 'Light theme', 'Tema claro') : L('Tema escuro', 'Dark theme', 'Tema oscuro')}
      aria-label={escuro ? L('Mudar para tema claro', 'Switch to light theme', 'Cambiar a tema claro') : L('Mudar para tema escuro', 'Switch to dark theme', 'Cambiar a tema oscuro')}>
      {escuro ? '☀️' : '🌙'}
    </button>
  )
}
