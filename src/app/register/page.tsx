'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, phone } },
    })

    if (authError) {
      setError(authError.message === 'User already registered' ? 'Este email ja esta cadastrado.' : authError.message)
      setLoading(false)
      return
    }

    if (authData.user) {
      await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_user_id: authData.user.id, email, name, phone }),
      })
    }

    setSuccess(true)
    setLoading(false)

    if (authData.session) {
      const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0]
      const cookieValue = btoa(JSON.stringify({ access_token: authData.session.access_token, refresh_token: authData.session.refresh_token, token_type: 'bearer' }))
      document.cookie = `sb-${ref}-auth-token=${cookieValue}; path=/; max-age=86400; SameSite=Lax`
      window.location.href = '/dashboard'
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f8f9fc' }}>
        <div className="text-center max-w-md">
          <div className="rounded-2xl p-10" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
            <p className="text-[40px] mb-4">✉️</p>
            <h2 className="text-[20px] font-extrabold mb-3" style={{ color: '#1a1a2e' }}>Verifique seu email</h2>
            <p className="text-[14px] mb-6" style={{ color: '#64748b' }}>Enviamos um link para <strong>{email}</strong>.</p>
            <Link href="/login" className="inline-block px-6 py-3 rounded-xl text-[14px] font-bold text-white" style={{ background: '#6366f1' }}>Ir para Login</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#f8f9fc' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-black" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>L</div>
            <span className="text-[20px] font-extrabold" style={{ color: '#1a1a2e' }}>LeadFlow</span>
          </Link>
          <p className="mt-3 text-[14px]" style={{ color: '#64748b' }}>Crie sua conta e comece a receber leads</p>
        </div>

        <div className="rounded-2xl p-8" style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="block text-[12px] font-bold mb-2" style={{ color: '#1a1a2e' }}>Nome completo</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" required
                className="w-full px-4 py-3.5 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
            </div>
            <div>
              <label className="block text-[12px] font-bold mb-2" style={{ color: '#1a1a2e' }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required
                className="w-full px-4 py-3.5 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
            </div>
            <div>
              <label className="block text-[12px] font-bold mb-2" style={{ color: '#1a1a2e' }}>Telefone / WhatsApp</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (407) 555-1234"
                className="w-full px-4 py-3.5 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
            </div>
            <div>
              <label className="block text-[12px] font-bold mb-2" style={{ color: '#1a1a2e' }}>Senha</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimo 6 caracteres" required minLength={6}
                className="w-full px-4 py-3.5 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
            </div>
            {error && <div className="text-[13px] font-semibold px-4 py-3 rounded-xl" style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>{error}</div>}
            <button type="submit" disabled={loading} className="w-full py-4 rounded-xl font-bold text-[14px] text-white disabled:opacity-50"
              style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
              {loading ? 'Criando conta...' : 'Criar Conta'}
            </button>
          </form>
          <div className="mt-8 text-center">
            <span className="text-[14px]" style={{ color: '#64748b' }}>Ja tem conta? </span>
            <Link href="/login" className="text-[14px] font-bold" style={{ color: '#6366f1' }}>Fazer login</Link>
          </div>
        </div>
        <p className="text-center text-[11px] mt-6" style={{ color: '#94a3b8' }}>🔒 Seus dados estao protegidos.</p>
      </div>
    </div>
  )
}
