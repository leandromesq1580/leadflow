'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { formatDate, statusLabel } from '@/lib/utils'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface Activity {
  id: string
  action: string
  notes: string
  created_at: string
  buyer: { name: string }
}

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
  campaign_name: string
  created_at: string
  activities: Activity[]
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadLead()
  }, [id])

  async function loadLead() {
    const res = await fetch(`/api/leads/${id}`)
    const data = await res.json()
    setLead(data.lead)
    setLoading(false)
  }

  async function addActivity() {
    if (!action) return
    setSubmitting(true)

    await fetch(`/api/leads/${id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, notes }),
    })

    setAction('')
    setNotes('')
    setSubmitting(false)
    loadLead()
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Carregando...</div>
  if (!lead) return <div className="text-center py-12 text-gray-400">Lead nao encontrado</div>

  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/leads" className="text-sm text-gray-400 hover:text-gray-600 mb-4 inline-block">
        ← Voltar para lista
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">{lead.name}</h1>
          <p className="text-sm text-gray-500">{lead.city}, {lead.state} — {lead.interest}</p>
        </div>
        <Badge status={lead.status} />
      </div>

      {/* Lead Info */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">Informacoes do Lead</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400 font-medium">Telefone</p>
            <a href={`tel:${lead.phone}`} className="text-base font-bold text-blue-600 hover:underline">
              {lead.phone}
            </a>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400 font-medium">Email</p>
            <a href={`mailto:${lead.email}`} className="text-sm font-semibold text-gray-900 hover:text-blue-600">
              {lead.email}
            </a>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400 font-medium">Interesse</p>
            <p className="text-sm font-semibold text-gray-900">{lead.interest}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400 font-medium">Campanha</p>
            <p className="text-sm font-semibold text-gray-900">{lead.campaign_name}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400 font-medium">Tipo</p>
            <Badge status={lead.type} />
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-400 font-medium">Recebido em</p>
            <p className="text-sm font-semibold text-gray-900">{formatDate(lead.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Add Activity */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">Registrar Atividade</h2>
        <div className="flex gap-3 mb-3 flex-wrap">
          {[
            { key: 'contacted', label: '📞 Contatei', color: 'bg-green-50 text-green-700 border-green-200' },
            { key: 'no_answer', label: '📵 Sem resposta', color: 'bg-gray-50 text-gray-600 border-gray-200' },
            { key: 'callback', label: '🔄 Retornar', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
            { key: 'meeting_set', label: '📅 Reuniao marcada', color: 'bg-blue-50 text-blue-700 border-blue-200' },
            { key: 'converted', label: '✅ Convertido!', color: 'bg-green-50 text-green-700 border-green-200' },
            { key: 'lost', label: '❌ Perdido', color: 'bg-red-50 text-red-700 border-red-200' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setAction(opt.key)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${
                action === opt.key ? opt.color + ' ring-2 ring-offset-1 ring-blue-400' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Adicionar notas (opcional)..."
          rows={2}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3 resize-none"
        />
        <button
          onClick={addActivity}
          disabled={!action || submitting}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-40"
        >
          {submitting ? 'Salvando...' : 'Salvar Atividade'}
        </button>
      </div>

      {/* Activity Timeline */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-bold text-gray-900 mb-4">Historico</h2>
        {lead.activities && lead.activities.length > 0 ? (
          <div className="space-y-4">
            {lead.activities
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((act) => (
              <div key={act.id} className="flex gap-3 items-start">
                <div className="w-2 h-2 bg-blue-400 rounded-full mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {statusLabel(act.action)}
                  </p>
                  {act.notes && <p className="text-sm text-gray-500 mt-0.5">{act.notes}</p>}
                  <p className="text-xs text-gray-400 mt-1">{formatDate(act.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Nenhuma atividade registrada</p>
        )}
      </div>
    </div>
  )
}
