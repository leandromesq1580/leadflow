'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

interface Buyer {
  id: string
  name: string
  email: string
  phone: string
  is_active: boolean
  created_at: string
  credits: { type: string; total_purchased: number; total_used: number }[]
  leads: { id: string }[]
}

export default function BuyersPage() {
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadBuyers() }, [])

  async function loadBuyers() {
    const supabase = createClient()
    const { data } = await supabase
      .from('buyers')
      .select('*, credits(*), leads:leads!assigned_to(id)')
      .eq('is_admin', false)
      .order('created_at', { ascending: false })

    setBuyers(data || [])
    setLoading(false)
  }

  async function toggleActive(id: string, current: boolean) {
    const supabase = createClient()
    await supabase.from('buyers').update({ is_active: !current }).eq('id', id)
    loadBuyers()
  }

  function getCredits(buyer: Buyer, type: string) {
    const creds = buyer.credits?.filter(c => c.type === type) || []
    const purchased = creds.reduce((s, c) => s + c.total_purchased, 0)
    const used = creds.reduce((s, c) => s + c.total_used, 0)
    return { purchased, used, remaining: purchased - used }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Compradores</h1>
          <p className="text-sm text-gray-500">{buyers.length} compradores cadastrados</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : buyers.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Comprador</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Creditos Lead</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Creditos Appt</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Leads Recebidos</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {buyers.map(b => {
                const leadCreds = getCredits(b, 'lead')
                const apptCreds = getCredits(b, 'appointment')
                return (
                  <tr key={b.id} className="border-t border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-sm">{b.name}</p>
                      <p className="text-xs text-gray-400">{b.email}</p>
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <span className="font-bold text-green-600">{leadCreds.remaining}</span>
                      <span className="text-gray-400">/{leadCreds.purchased}</span>
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <span className="font-bold text-orange-600">{apptCreds.remaining}</span>
                      <span className="text-gray-400">/{apptCreds.purchased}</span>
                    </td>
                    <td className="px-5 py-3 text-sm font-semibold">{b.leads?.length || 0}</td>
                    <td className="px-5 py-3">
                      <Badge status={b.is_active ? 'active' : 'pending'} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <Link href={`/admin/buyers/${b.id}`} className="text-xs text-blue-600 font-semibold hover:underline">
                          Ver
                        </Link>
                        <button
                          onClick={() => toggleActive(b.id, b.is_active)}
                          className={`text-xs font-semibold ${b.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-700'}`}
                        >
                          {b.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">👥</p>
            <p className="text-gray-500 font-medium">Nenhum comprador cadastrado</p>
          </div>
        )}
      </div>
    </div>
  )
}
