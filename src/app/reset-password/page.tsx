'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

type Mode = 'request' | 'update'

export default function ResetPasswordPage() {
  const [mode, setMode] = useState<Mode>('request')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    if (!hash.includes('access_token')) { setReady(true); return }
    const params = new URLSearchParams(hash.slice(1))
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    const type = params.get('type')
    if (type !== 'recovery' || !access_token || !refresh_token) { setReady(true); return }
    ;(async () => {
      const supabase = createClient()
      const { error: sErr } = await supabase.auth.setSession({ access_token, refresh_token })
      if (sErr) setError('Link expirado ou invalido. Solicite um novo.')
      else setMode('update')
      window.history.replaceState({}, '', '/reset-password')
      setReady(true)
    })()
  }, [])

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(''); setInfo('')
    try {
      const supabase = createClient()
      const { error: rErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (rErr) setError(rErr.message)
      else setInfo('Se o email existir, enviamos um link pra recuperar a senha. Veja sua caixa de entrada.')
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('Senha precisa ter pelo menos 6 caracteres'); return }
    setLoading(true); setError(''); setInfo('')
    try {
      const supabase = createClient()
      const { data, error: uErr } = await supabase.auth.updateUser({ password })
      if (uErr) { setError(uErr.message); setLoading(false); return }
      const { data: sess } = await supabase.auth.getSession()
      if (sess?.session && data?.user) {
        const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0]
        const cookieValue = btoa(JSON.stringify({
          access_token: sess.session.access_token,
          refresh_token: sess.session.refresh_token,
          token_type: 'bearer',
        }))
        document.cookie = `sb-${ref}-auth-token=${cookieValue}; path=/; max-age=86400; SameSite=Lax`
      }
      window.location.href = '/dashboard'
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado')
      setLoading(false)
    }
  }

  if (!ready) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#f8f9fc', color: '#94a3b8' }}>Carregando...</div>

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#f8f9fc' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-black" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>L</div>
            <span className="text-[20px] font-extrabold" style={{ color: '#1a1a2e' }}>Lead4Producers</span>
          </Link>
          <p className="mt-3 text-[14px]" style={{ color: '#64748b' }}>
            {mode === 'request' ? 'Recuperar senha' : 'Defina sua nova senha'}
          </p>
        </div>

        <div className="rounded-2xl p-8" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
          {mode === 'request' ? (
            <form onSubmit={handleRequest} className="space-y-5">
              <div>
                <label className="block text-[12px] font-bold mb-2" style={{ color: '#1a1a2e' }}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required autoComplete="email"
                  className="w-full px-4 py-3.5 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
              </div>
              {error && <div className="text-[13px] font-semibold px-4 py-3 rounded-xl" style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>{error}</div>}
              {info && <div className="text-[13px] font-semibold px-4 py-3 rounded-xl" style={{ background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0' }}>{info}</div>}
              <button type="submit" disabled={loading} className="w-full py-4 rounded-xl font-bold text-[14px] text-white disabled:opacity-50"
                style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
                {loading ? 'Enviando...' : 'Enviar link de recuperacao'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleUpdate} className="space-y-5">
              <div>
                <label className="block text-[12px] font-bold mb-2" style={{ color: '#1a1a2e' }}>Nova senha</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nova senha" required autoComplete="new-password" minLength={6}
                    className="w-full px-4 py-3.5 pr-12 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
                  <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-slate-100" style={{ color: '#64748b' }}>
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>
              {error && <div className="text-[13px] font-semibold px-4 py-3 rounded-xl" style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>{error}</div>}
              <button type="submit" disabled={loading} className="w-full py-4 rounded-xl font-bold text-[14px] text-white disabled:opacity-50"
                style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
                {loading ? 'Salvando...' : 'Salvar nova senha'}
              </button>
            </form>
          )}
          <div className="mt-8 text-center">
            <Link href="/login" className="text-[13px] font-bold" style={{ color: '#6366f1' }}>Voltar para login</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
