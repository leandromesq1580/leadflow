'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Lead = {
  id: string
  name: string
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  interest: string | null
  type: string | null
  status: string | null
  created_at: string
  archived_at: string | null
  archived_by: string | null
  assigned_to_member: string | null
  contract_closed: boolean | null
  policy_value: number | null
}

function timeSinceArchived(ts: string | null): string {
  if (!ts) return ''
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return 'há instantes'
  if (s < 3600) return `há ${Math.floor(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`
  if (s < 86400 * 30) return `há ${Math.floor(s / 86400)} dias`
  return new Date(ts).toLocaleDateString('pt-BR')
}

export default function ArchivedLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [reactivating, setReactivating] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/leads/archived')
      const d = await r.json()
      setLeads(d.leads || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function reactivate(leadId: string) {
    if (!confirm('Reativar este lead? Ele voltará para a primeira etapa do pipeline.')) return
    setReactivating(leadId)
    try {
      const r = await fetch(`/api/leads/${leadId}/unarchive`, { method: 'POST' })
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: 'Erro desconhecido' }))
        alert('Erro ao reativar: ' + (d.error || r.status))
        return
      }
      // Remove from local list
      setLeads(ls => ls.filter(l => l.id !== leadId))
    } finally {
      setReactivating(null)
    }
  }

  const filtered = search
    ? leads.filter(l => {
        const q = search.toLowerCase()
        return (
          l.name?.toLowerCase().includes(q) ||
          l.phone?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.interest?.toLowerCase().includes(q)
        )
      })
    : leads

  return (
    <div className="px-8 py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/pipeline"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all hover:shadow-sm"
            style={{ background: '#fff', color: '#64748b', border: '1px solid #e8ecf4' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Voltar ao pipeline
          </Link>
          <h1 className="text-[22px] font-extrabold tracking-tight" style={{ color: '#1a1a2e' }}>
            Leads arquivados
          </h1>
          <span
            className="text-[11px] font-bold px-2 py-1 rounded-md"
            style={{ background: '#f1f5f9', color: '#64748b' }}
          >
            {leads.length}
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="mb-5">
        <input
          type="text"
          placeholder="Buscar por nome, telefone, email ou interesse..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl text-[13px] outline-none transition-all focus:shadow-sm"
          style={{ background: '#fff', border: '1px solid #e8ecf4', color: '#1a1a2e' }}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-[13px]" style={{ color: '#94a3b8' }}>
          Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="text-center py-20 rounded-2xl"
          style={{ background: '#fff', border: '1px dashed #e8ecf4' }}
        >
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: '#f1f5f9' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="5" rx="1" />
              <path d="M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
              <path d="M10 13h4" />
            </svg>
          </div>
          <p className="text-[14px] font-bold mb-1" style={{ color: '#475569' }}>
            {search ? 'Nenhum lead arquivado encontrado' : 'Nenhum lead arquivado'}
          </p>
          <p className="text-[12px]" style={{ color: '#94a3b8' }}>
            {search ? 'Tente outra busca.' : 'Quando você arquivar leads, eles aparecem aqui.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((l) => (
            <div
              key={l.id}
              className="p-4 rounded-2xl flex items-center gap-4 transition-all hover:shadow-sm"
              style={{ background: '#fff', border: '1px solid #e8ecf4' }}
            >
              {/* Avatar */}
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-[14px] font-extrabold text-white flex-shrink-0"
                style={{ background: '#94a3b8' }}
              >
                {(l.name || '?').charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[14px] font-bold truncate" style={{ color: '#1a1a2e' }}>
                    {l.name || 'Sem nome'}
                  </p>
                  {l.contract_closed && (
                    <span
                      className="text-[10px] font-extrabold px-1.5 py-0.5 rounded"
                      style={{ background: '#dcfce7', color: '#15803d' }}
                    >
                      FECHADO
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px]" style={{ color: '#64748b' }}>
                  {l.phone && <span>📱 {l.phone}</span>}
                  {l.city && <span>📍 {l.city}{l.state ? `/${l.state}` : ''}</span>}
                  {l.interest && <span className="truncate">💡 {l.interest}</span>}
                </div>
                <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>
                  Arquivado {timeSinceArchived(l.archived_at)}
                </p>
              </div>

              {/* Action */}
              <button
                onClick={() => reactivate(l.id)}
                disabled={reactivating === l.id}
                className="px-4 py-2 rounded-xl text-[12px] font-bold transition-all hover:shadow-sm disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                style={{ background: '#6366f1', color: '#fff' }}
              >
                {reactivating === l.id ? (
                  'Reativando...'
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    Reativar
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
