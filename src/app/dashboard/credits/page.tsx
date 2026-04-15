'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PRODUCTS } from '@/lib/stripe'
import { useSearchParams } from 'next/navigation'

interface Credit {
  id: string
  type: string
  total_purchased: number
  total_used: number
  price_per_unit: number
  purchased_at: string
}

export default function CreditsPage() {
  const [credits, setCredits] = useState<Credit[]>([])
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState('')
  const searchParams = useSearchParams()
  const success = searchParams.get('success')

  useEffect(() => {
    loadCredits()
  }, [])

  async function loadCredits() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: buyer } = await supabase
      .from('buyers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!buyer) return

    const { data } = await supabase
      .from('credits')
      .select('*')
      .eq('buyer_id', buyer.id)
      .order('purchased_at', { ascending: false })

    setCredits(data || [])
    setLoading(false)
  }

  async function buyPackage(packageId: string) {
    setPurchasing(packageId)

    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageId }),
    })

    const data = await res.json()

    if (data.url) {
      window.location.href = data.url
    } else {
      alert('Erro: ' + JSON.stringify(data))
      setPurchasing('')
    }
  }

  const totalRemaining = (type: string) => {
    return credits
      .filter(c => c.type === type)
      .reduce((sum, c) => sum + (c.total_purchased - c.total_used), 0)
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Creditos</h1>
      <p className="text-sm text-gray-500 mb-6">Compre creditos para receber leads ou appointments</p>

      {success && (
        <div className="bg-green-50 text-green-700 px-5 py-4 rounded-2xl mb-6 font-medium text-sm border border-green-100">
          ✅ Pagamento confirmado! Seus creditos ja estao disponiveis.
        </div>
      )}

      {/* Current Balance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 font-medium">Leads Disponiveis</p>
          <p className="text-3xl font-extrabold text-blue-600 mt-1">{totalRemaining('lead')}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 font-medium">Appointments Disponiveis</p>
          <p className="text-3xl font-extrabold text-orange-600 mt-1">{totalRemaining('appointment')}</p>
        </div>
      </div>

      {/* Lead Packages */}
      <h2 className="text-lg font-bold text-gray-900 mb-4">📋 Pacotes de Leads Exclusivos</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {PRODUCTS.lead.packages.map((pkg) => (
          <div key={pkg.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all">
            <p className="text-sm text-gray-500 font-medium">{pkg.quantity} Leads</p>
            <p className="text-3xl font-extrabold text-gray-900 mt-1">${pkg.totalDisplay}</p>
            <p className="text-xs text-gray-400 mt-1">${pkg.pricePerUnit}/lead</p>
            <button
              onClick={() => buyPackage(pkg.id)}
              disabled={purchasing === pkg.id}
              className="w-full mt-4 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {purchasing === pkg.id ? 'Redirecionando...' : 'Comprar'}
            </button>
          </div>
        ))}
      </div>

      {/* Appointment Packages */}
      <h2 className="text-lg font-bold text-gray-900 mb-4">📅 Pacotes de Appointments</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {PRODUCTS.appointment.packages.map((pkg) => (
          <div key={pkg.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:border-orange-300 hover:shadow-md transition-all">
            <p className="text-sm text-gray-500 font-medium">{pkg.quantity} Appointments</p>
            <p className="text-3xl font-extrabold text-gray-900 mt-1">${pkg.totalDisplay}</p>
            <p className="text-xs text-gray-400 mt-1">${pkg.pricePerUnit}/appointment</p>
            <button
              onClick={() => buyPackage(pkg.id)}
              disabled={purchasing === pkg.id}
              className="w-full mt-4 bg-orange-500 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {purchasing === pkg.id ? 'Redirecionando...' : 'Comprar'}
            </button>
          </div>
        ))}
      </div>

      {/* Purchase History */}
      <h2 className="text-lg font-bold text-gray-900 mb-4">Historico de Compras</h2>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {credits.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Tipo</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Quantidade</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Usado</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Restante</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Data</th>
              </tr>
            </thead>
            <tbody>
              {credits.map(c => (
                <tr key={c.id} className="border-t border-gray-50">
                  <td className="px-5 py-3 text-sm font-semibold capitalize">{c.type === 'lead' ? '📋 Lead' : '📅 Appointment'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{c.total_purchased}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{c.total_used}</td>
                  <td className="px-5 py-3 text-sm font-bold text-green-600">{c.total_purchased - c.total_used}</td>
                  <td className="px-5 py-3 text-xs text-gray-400">{new Date(c.purchased_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12 text-gray-400 text-sm">Nenhuma compra ainda</div>
        )}
      </div>
    </div>
  )
}
