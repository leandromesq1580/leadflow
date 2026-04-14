'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone },
      },
    })

    if (authError) {
      setError(authError.message === 'User already registered'
        ? 'Este email ja esta cadastrado. Faca login.'
        : authError.message)
      setLoading(false)
      return
    }

    if (authData.user) {
      const { error: buyerError } = await supabase.from('buyers').insert({
        auth_user_id: authData.user.id,
        email,
        name,
        phone,
      })

      if (buyerError) {
        console.error('Failed to create buyer:', buyerError)
      }
    }

    setSuccess(true)
    setLoading(false)

    if (authData.session) {
      router.push('/dashboard')
      router.refresh()
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-10">
            <div className="text-5xl mb-5">&#9993;</div>
            <h2 className="text-2xl font-extrabold text-slate-900 mb-3">Verifique seu email</h2>
            <p className="text-slate-500 text-base leading-relaxed mb-8">
              Enviamos um link de confirmacao para <strong className="text-slate-800">{email}</strong>.
              Clique no link para ativar sua conta.
            </p>
            <Link href="/login" className="inline-block bg-blue-600 text-white px-8 py-3 rounded-xl font-bold text-base hover:bg-blue-700 transition-colors">
              Ir para Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-block text-3xl font-extrabold text-slate-900 tracking-tight">
            Lead<span className="text-blue-600">Flow</span>
          </Link>
          <p className="text-slate-500 mt-3 text-base">Crie sua conta e comece a receber leads</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2">Nome completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Carlos Silva"
                required
                className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-base text-slate-900 font-medium placeholder:text-slate-400 placeholder:font-normal focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-base text-slate-900 font-medium placeholder:text-slate-400 placeholder:font-normal focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2">Telefone / WhatsApp</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (407) 555-1234"
                className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-base text-slate-900 font-medium placeholder:text-slate-400 placeholder:font-normal focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 6 caracteres"
                required
                minLength={6}
                className="w-full px-4 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-base text-slate-900 font-medium placeholder:text-slate-400 placeholder:font-normal focus:bg-white transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-50 border-2 border-red-200 text-red-700 text-sm font-semibold px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-base hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20 hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5 active:translate-y-0"
            >
              {loading ? 'Criando conta...' : 'Criar Conta'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <span className="text-slate-500 text-base">Ja tem conta? </span>
            <Link href="/login" className="text-blue-600 font-bold text-base hover:underline">
              Fazer login
            </Link>
          </div>
        </div>

        {/* Trust */}
        <p className="text-center text-slate-400 text-xs mt-6">
          🔒 Seus dados estao protegidos. Nao compartilhamos com terceiros.
        </p>
      </div>
    </div>
  )
}
