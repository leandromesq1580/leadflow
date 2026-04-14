'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { timeAgo } from '@/lib/utils'

interface Lead {
  id: string
  name: string
  email: string
  phone: string
  city: string
  state: string
  interest: string
  type: string
  status: string
  product_type: string
  campaign_name: string
  created_at: string
  buyer: { name: string } | null
}

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => { loadLeads() }, [])

  async function loadLeads() {
    const supabase = createClient()
    const { data } = await supabase
      .from('leads')
      .select('*, buyer:buyers!assigned_to(name)')
      .order('created_at', { ascending: false })
      .limit(100)

    setLeads(data || [])
    setLoading(false)
  }

  const filtered = leads.filter(l => {
    if (filter === 'available') return l.status === 'new'
    if (filter === 'sold') return l.status !== 'new'
    return true
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Todos os Leads</h1>
          <p className="text-sm text-gray-500">{leads.length} leads no total</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {[
          { key: 'all', label: `Todos (${leads.length})` },
          { key: 'available', label: `Disponiveis (${leads.filter(l => l.status === 'new').length})` },
          { key: 'sold', label: `Vendidos (${leads.filter(l => l.status !== 'new').length})` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Lead</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Cidade</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Campanha</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Produto</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Vendido para</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => (
                <tr key={lead.id} className="border-t border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-sm">{lead.name}</p>
                    <p className="text-xs text-gray-400">{lead.phone}</p>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{lead.city}, {lead.state}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">{lead.campaign_name}</td>
                  <td className="px-5 py-3">
                    <Badge status={lead.product_type === 'lead' ? 'cold' : 'hot'}>
                      {lead.product_type === 'lead' ? 'Lead' : 'Appointment'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-sm">
                    {lead.buyer?.name || <span className="text-orange-500 font-semibold">Disponivel</span>}
                  </td>
                  <td className="px-5 py-3"><Badge status={lead.status} /></td>
                  <td className="px-5 py-3 text-xs text-gray-400">{timeAgo(lead.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
