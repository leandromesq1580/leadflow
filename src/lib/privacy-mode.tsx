'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

interface PrivacyContextValue {
  enabled: boolean
  toggle: () => void
  mask: (value: string | null | undefined, type?: 'phone' | 'email' | 'auto') => string
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null)

const STORAGE_KEY = 'l4p-privacy-mode'

function maskPhone(v: string): string {
  // Mantém prefixo internacional curto e tamanho aproximado pra UI nao colapsar
  const trimmed = v.trim()
  // Se tem "+", preserva ele
  const hasPlus = trimmed.startsWith('+')
  return (hasPlus ? '+' : '') + '••• ••• ••••'
}

function maskEmail(v: string): string {
  const m = v.match(/^([^@]+)@(.+)$/)
  if (!m) return '•••••'
  return '•••••@' + m[2].split('.').map((_, i, arr) => i === arr.length - 1 ? '•••' : '••').join('.')
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === '1') setEnabled(true)
    } catch {}
  }, [])

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }, [])

  const mask = useCallback((value: string | null | undefined, type: 'phone' | 'email' | 'auto' = 'auto'): string => {
    if (!enabled) return value || ''
    if (!value) return ''
    const v = String(value).trim()
    if (!v) return ''
    if (type === 'phone') return maskPhone(v)
    if (type === 'email') return maskEmail(v)
    // auto: detecta email vs phone
    return isEmail(v) ? maskEmail(v) : maskPhone(v)
  }, [enabled])

  return (
    <PrivacyContext.Provider value={{ enabled, toggle, mask }}>
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext)
  if (!ctx) {
    // Fallback seguro fora do provider: nao mascara
    return {
      enabled: false,
      toggle: () => {},
      mask: (v) => v || '',
    }
  }
  return ctx
}
