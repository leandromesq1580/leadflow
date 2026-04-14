'use client'

import { useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou senha incorretos')
      setLoading(false)
      return
    }

    router.push(redirect)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-block text-3xl font-extrabold text-slate-900 tracking-tight">
            Lead<span className="text-blue-600">Flow</span>
          </Link>
          <p className="text-slate-500 mt-3 text-base">Acesse sua conta</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
          <form onSubmit={handleLogin} className="space-y-5">
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
              <label className="block text-sm font-bold text-slate-800 mb-2">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                required
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
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <span className="text-slate-500 text-base">Nao tem conta? </span>
            <Link href="/register" className="text-blue-600 font-bold text-base hover:underline">
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
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-lg">Carregando...</div>}>
      <LoginForm />
    </Suspense>
  )
}
