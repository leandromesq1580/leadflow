'use client'

import { useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

      if (authError) {
        setError(authError.message === 'Invalid login credentials' ? 'Email ou senha incorretos' : authError.message)
        setLoading(false)
        return
      }

      if (!data.session) { setError('Sessao nao criada'); setLoading(false); return }

      const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0]
      const cookieValue = btoa(JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token, token_type: 'bearer' }))
      document.cookie = `sb-${ref}-auth-token=${cookieValue}; path=/; max-age=86400; SameSite=Lax`

      window.location.href = redirect
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#f8f9fc' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-black" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>L</div>
            <span className="text-[20px] font-extrabold" style={{ color: '#1a1a2e' }}>Lead4Producers</span>
          </Link>
          <p className="mt-3 text-[14px]" style={{ color: '#64748b' }}>Acesse sua conta</p>
        </div>

        <div className="rounded-2xl p-8" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[12px] font-bold mb-2" style={{ color: '#1a1a2e' }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required autoComplete="email"
                className="w-full px-4 py-3.5 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
            </div>
            <div>
              <label className="block text-[12px] font-bold mb-2" style={{ color: '#1a1a2e' }}>Senha</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" required autoComplete="current-password"
                  className="w-full px-4 py-3.5 pr-12 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-slate-200 transition-colors"
                  style={{ color: '#64748b' }}>
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              <div className="mt-2 text-right">
                <Link href="/reset-password" className="text-[12px] font-semibold" style={{ color: '#6366f1' }}>Esqueci a senha</Link>
              </div>
            </div>
            {error && <div className="text-[13px] font-semibold px-4 py-3 rounded-xl" style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>{error}</div>}
            <button type="submit" disabled={loading} className="w-full py-4 rounded-xl font-bold text-[14px] text-white disabled:opacity-50"
              style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
          <div className="mt-8 text-center">
            <span className="text-[14px]" style={{ color: '#64748b' }}>Nao tem conta? </span>
            <Link href="/register" className="text-[14px] font-bold" style={{ color: '#6366f1' }}>Criar conta</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: '#f8f9fc', color: '#94a3b8' }}>Carregando...</div>}>
      <LoginForm />
    </Suspense>
  )
}
