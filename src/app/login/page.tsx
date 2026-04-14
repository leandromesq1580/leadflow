'use client'

import { useState, Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError(authError.message === 'Invalid login credentials'
          ? 'Email ou senha incorretos'
          : authError.message)
        setLoading(false)
        return
      }

      if (!data.session) {
        setError('Sessao nao criada. Tente novamente.')
        setLoading(false)
        return
      }

      // Save auth token as cookie for server-side reading
      const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0]
      const cookieValue = btoa(JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        token_type: 'bearer',
      }))
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
          <Link href="/" className="inline-block text-3xl font-extrabold tracking-tight" style={{ color: '#1a1a2e' }}>
            Lead<span style={{ color: '#6366f1' }}>Flow</span>
          </Link>
          <p className="mt-3 text-base" style={{ color: '#64748b' }}>Acesse sua conta</p>
        </div>

        <div className="rounded-2xl p-8" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: '#1a1a2e' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                className="w-full px-4 py-3.5 rounded-xl text-base font-medium"
                style={{ background: '#f8f9fc', border: '2px solid #e8ecf4', color: '#1a1a2e' }}
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: '#1a1a2e' }}>Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3.5 rounded-xl text-base font-medium"
                style={{ background: '#f8f9fc', border: '2px solid #e8ecf4', color: '#1a1a2e' }}
              />
            </div>

            {error && (
              <div className="text-sm font-semibold px-4 py-3 rounded-xl" style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-xl font-bold text-base text-white disabled:opacity-50"
              style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <span className="text-base" style={{ color: '#64748b' }}>Nao tem conta? </span>
            <Link href="/register" className="font-bold text-base" style={{ color: '#6366f1' }}>
              Criar conta
            </Link>
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
