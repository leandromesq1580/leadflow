'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { StatCard } from '@/components/ui/stat-card'

interface Payment {
  id: string
  amount: number
  product_type: string
  quantity: number
  price_per_unit: number
  status: string
  created_at: string
  buyer: { name: string; email: string }
}

export default function RevenuePage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadPayments() }, [])

  async function loadPayments() {
    const supabase = createClient()
    const { data } = await supabase
      .from('payments')
      .select('*, buyer:buyers(name, email)')
      .order('created_at', { ascending: false })

    setPayments(data || [])
    setLoading(false)
  }

  const completedPayments = payments.filter(p => p.status === 'completed')
  const totalRevenue = completedPayments.reduce((s, p) => s + Number(p.amount), 0)
  const totalLeadsSold = completedPayments.filter(p => p.product_type === 'lead').reduce((s, p) => s + p.quantity, 0)
  const totalApptsSold = completedPayments.filter(p => p.product_type === 'appointment').reduce((s, p) => s + p.quantity, 0)

  // Monthly breakdown
  const monthly: Record<string, number> = {}
  completedPayments.forEach(p => {
    const month = new Date(p.created_at).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    monthly[month] = (monthly[month] || 0) + Number(p.amount)
  })

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Receita</h1>
      <p className="text-sm text-gray-500 mb-6">Acompanhe seus ganhos</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Receita Total" value={`$${totalRevenue.toLocaleString()}`} />
        <StatCard label="Leads Vendidos" value={totalLeadsSold} />
        <StatCard label="Appointments Vendidos" value={totalApptsSold} />
        <StatCard label="Pagamentos" value={completedPayments.length} />
      </div>

      {/* Monthly Chart */}
      {Object.keys(monthly).length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="font-bold text-gray-900 mb-4">Receita por Mes</h2>
          <div className="flex items-end gap-3 h-48">
            {Object.entries(monthly).reverse().map(([month, amount]) => {
              const maxAmount = Math.max(...Object.values(monthly))
              const height = (amount / maxAmount) * 100
              return (
                <div key={month} className="flex-1 flex flex-col items-center">
                  <span className="text-xs font-bold text-gray-700 mb-1">${amount}</span>
                  <div
                    className="w-full bg-gradient-to-t from-blue-600 to-purple-500 rounded-t-lg"
                    style={{ height: `${Math.max(height, 5)}%` }}
                  />
                  <span className="text-xs text-gray-400 mt-2">{month}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Payments Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="font-bold text-gray-900">Historico de Pagamentos</h2>
        </div>
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : payments.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Comprador</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Produto</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Qtd</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Valor</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Data</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="text-sm font-semibold">{p.buyer?.name}</p>
                    <p className="text-xs text-gray-400">{p.buyer?.email}</p>
                  </td>
                  <td className="px-5 py-3 text-sm capitalize">{p.product_type === 'lead' ? '📋 Lead' : '📅 Appt'}</td>
                  <td className="px-5 py-3 text-sm">{p.quantity}x</td>
                  <td className="px-5 py-3 text-sm font-bold text-green-600">${Number(p.amount).toFixed(0)}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      p.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {p.status === 'completed' ? 'Pago' : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">
                    {new Date(p.created_at).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12 text-gray-400 text-sm">Nenhum pagamento ainda</div>
        )}
      </div>
    </div>
  )
}
