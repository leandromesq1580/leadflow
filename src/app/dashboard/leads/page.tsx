'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { timeAgo } from '@/lib/utils'
import Link from 'next/link'

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
  created_at: string
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadLeads()
  }, [])

  async function loadLeads() {
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
      .from('leads')
      .select('*')
      .eq('assigned_to', buyer.id)
      .order('created_at', { ascending: false })

    setLeads(data || [])
    setLoading(false)
  }

  const filtered = leads.filter(l => {
    if (filter !== 'all' && l.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return `${l.name} ${l.phone} ${l.city} ${l.email}`.toLowerCase().includes(q)
    }
    return true
  })

  const statusCounts = {
    all: leads.length,
    assigned: leads.filter(l => l.status === 'assigned').length,
    qualified: leads.filter(l => l.status === 'qualified').length,
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Meus Leads</h1>
          <p className="text-sm text-gray-500">{leads.length} leads no total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'all', label: `Todos (${statusCounts.all})` },
          { key: 'assigned', label: `Novos (${statusCounts.assigned})` },
          { key: 'qualified', label: `Qualificados (${statusCounts.qualified})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              filter === tab.key
                ? 'bg-blue-100 text-blue-700'
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <input
            type="text"
            placeholder="Buscar por nome, telefone, cidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-sm px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : filtered.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Lead</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Telefone</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Cidade</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Interesse</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Tipo</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase">Recebido</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={lead.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-sm text-gray-900">{lead.name}</p>
                    <p className="text-xs text-gray-400">{lead.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <a href={`tel:${lead.phone}`} className="text-sm text-blue-600 font-medium hover:underline">
                      {lead.phone}
                    </a>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{lead.city}, {lead.state}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{lead.interest}</td>
                  <td className="px-5 py-3"><Badge status={lead.type} /></td>
                  <td className="px-5 py-3"><Badge status={lead.status} /></td>
                  <td className="px-5 py-3 text-xs text-gray-400">{timeAgo(lead.created_at)}</td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/leads/${lead.id}`}
                      className="text-sm text-blue-600 font-semibold hover:underline"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-gray-500 font-medium">Nenhum lead encontrado</p>
          </div>
        )}
      </div>
    </div>
  )
}
