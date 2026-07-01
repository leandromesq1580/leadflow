'use client'

import '../m/m-theme.css'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const sp = useSearchParams()
  const redirect = sp.get('redirect') || '/m'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr('')
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setErr(error.message === 'Invalid login credentials' ? 'Email ou senha incorretos' : error.message); setLoading(false); return }
      if (!data.session) { setErr('Sessão não criada'); setLoading(false); return }
      const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0]
      const cookieValue = btoa(JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token, token_type: 'bearer' }))
      document.cookie = `sb-${ref}-auth-token=${cookieValue}; path=/; max-age=86400; SameSite=Lax`
      window.location.href = redirect
    } catch { setErr('Erro inesperado'); setLoading(false) }
  }

  return (
    <div style={{ width: '100%', maxWidth: 360 }}>
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, fontWeight: 800, margin: '0 auto 18px', boxShadow: '0 16px 38px -10px rgba(99,102,241,0.8)' }}>L4</div>
        <h1 style={{ fontSize: 23, fontWeight: 700, margin: 0, color: '#fff' }}>Lead4Pro</h1>
        <p className="m-muted" style={{ margin: '6px 0 0', fontSize: 14 }}>Entre na sua conta</p>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className="m-muted" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 7 }}>E-mail</label>
          <input className="m-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" required style={{ height: 50 }} />
        </div>
        <div>
          <label className="m-muted" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 7 }}>Senha</label>
          <div style={{ position: 'relative' }}>
            <input className="m-input" type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Sua senha" autoComplete="current-password" required style={{ height: 50, paddingRight: 64 }} />
            <button type="button" onClick={() => setShow(v => !v)} className="m-tap" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--m-faint)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{show ? 'ocultar' : 'mostrar'}</button>
          </div>
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <Link href="/reset-password" style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc', textDecoration: 'none' }}>Esqueci a senha</Link>
          </div>
        </div>
        {err && <div style={{ fontSize: 13, fontWeight: 600, padding: '11px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>{err}</div>}
        <button type="submit" disabled={loading} className="m-tap" style={{ width: '100%', height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4, opacity: loading ? 0.6 : 1, boxShadow: '0 14px 32px -10px rgba(99,102,241,0.75)' }}>{loading ? 'Entrando…' : 'Entrar'}</button>
      </form>

      <p style={{ textAlign: 'center', marginTop: 26, fontSize: 14 }}>
        <span className="m-muted">Não tem conta? </span>
        <Link href="/register" style={{ fontWeight: 700, color: '#a5b4fc', textDecoration: 'none' }}>Criar conta</Link>
      </p>
    </div>
  )
}

// Branded loading state — server-rendered so it paints instantly from HTML (no JS needed).
// Turns a slow WebView/network load into "Lead4Pro is loading" instead of a black screen.
function BrandedLoader() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, fontWeight: 800, boxShadow: '0 16px 38px -10px rgba(99,102,241,0.8)' }}>L4</div>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>Lead4Pro</p>
      <div className="m-spin" />
    </div>
  )
}

export default function MobileLogin() {
  return (
    <div className="m-root m-tap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 22px', minHeight: '100dvh' }}>
      <Suspense fallback={<BrandedLoader />}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
