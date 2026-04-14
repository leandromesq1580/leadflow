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

    // 1. Create auth user
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

    // 2. Create buyer record
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

    // If email confirmation is disabled, redirect directly
    if (authData.session) {
      router.push('/dashboard')
      router.refresh()
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="text-5xl mb-4">&#9993;</div>
            <h2 className="text-xl font-bold mb-2">Verifique seu email</h2>
            <p className="text-gray-500 text-sm mb-6">
              Enviamos um link de confirmacao para <strong>{email}</strong>. Clique no link para ativar sua conta.
            </p>
            <Link href="/login" className="text-blue-600 font-semibold text-sm hover:underline">
              Ir para Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-extrabold text-gray-900">
            Lead<span className="text-blue-600">Flow</span>
          </Link>
          <p className="text-gray-500 mt-2">Crie sua conta e comece a receber leads</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Nome completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Telefone / WhatsApp</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (407) 555-1234"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 6 caracteres"
                required
                minLength={6}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Criando conta...' : 'Criar Conta'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            Ja tem conta?{' '}
            <Link href="/login" className="text-blue-600 font-semibold hover:underline">
              Fazer login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
