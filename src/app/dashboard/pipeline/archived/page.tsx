'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n-client'

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

function timeSinceArchived(ts: string | null, locale: string = 'pt'): string {
  if (!ts) return ''
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return L('há instantes', 'just now', 'hace instantes')
  if (s < 3600) return L(`há ${Math.floor(s / 60)} min`, `${Math.floor(s / 60)} min ago`, `hace ${Math.floor(s / 60)} min`)
  if (s < 86400) return L(`há ${Math.floor(s / 3600)} h`, `${Math.floor(s / 3600)} h ago`, `hace ${Math.floor(s / 3600)} h`)
  if (s < 86400 * 30) return L(`há ${Math.floor(s / 86400)} dias`, `${Math.floor(s / 86400)} days ago`, `hace ${Math.floor(s / 86400)} días`)
  return new Date(ts).toLocaleDateString(locale === 'en' ? 'en-US' : locale === 'es' ? 'es-US' : 'pt-BR')
}

export default function ArchivedLeadsPage() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [reactivating, setReactivating] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
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
    if (!confirm(L('Reativar este lead? Ele voltará para a primeira etapa do pipeline.', 'Reactivate this lead? It will go back to the first stage of the pipeline.', '¿Reactivar este lead? Volverá a la primera etapa del pipeline.'))) return
    setReactivating(leadId)
    try {
      const r = await fetch(`/api/leads/${leadId}/unarchive`, { method: 'POST' })
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: L('Erro desconhecido', 'Unknown error', 'Error desconocido') }))
        alert(L('Erro ao reativar: ', 'Error reactivating: ', 'Error al reactivar: ') + (d.error || r.status))
        return
      }
      // Remove from local list
      setLeads(ls => ls.filter(l => l.id !== leadId))
    } finally {
      setReactivating(null)
    }
  }

  async function deleteForever(l: Lead) {
    const label = l.name?.trim() || L('este lead', 'this lead', 'este lead')
    if (!confirm(L(
      `EXCLUIR DEFINITIVAMENTE "${label}"?\n\nIsso apaga o lead com todas as mensagens, formulários, anexos e histórico.\n\n⚠️ NÃO dá pra desfazer.`,
      `PERMANENTLY DELETE "${label}"?\n\nThis erases the lead with all messages, forms, attachments and history.\n\n⚠️ This CANNOT be undone.`,
      `¿ELIMINAR DEFINITIVAMENTE "${label}"?\n\nEsto borra el lead con todos los mensajes, formularios, adjuntos e historial.\n\n⚠️ NO se puede deshacer.`,
    ))) return
    if (!confirm(L(`Última confirmação: excluir "${label}" pra sempre?`, `Last confirmation: delete "${label}" forever?`, `Última confirmación: ¿eliminar "${label}" para siempre?`))) return
    setDeleting(l.id)
    try {
      const r = await fetch(`/api/leads/${l.id}`, { method: 'DELETE' })
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: L('Erro desconhecido', 'Unknown error', 'Error desconocido') }))
        alert(L('Erro ao excluir: ', 'Error deleting: ', 'Error al eliminar: ') + (d.error || r.status))
        return
      }
      setLeads(ls => ls.filter(x => x.id !== l.id))
    } finally {
      setDeleting(null)
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
            {L('Voltar ao pipeline', 'Back to pipeline', 'Volver al pipeline')}
          </Link>
          <h1 className="text-[22px] font-extrabold tracking-tight" style={{ color: '#1a1a2e' }}>
            {L('Leads arquivados', 'Archived leads', 'Leads archivados')}
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
          placeholder={L('Buscar por nome, telefone, email ou interesse...', 'Search by name, phone, email or interest...', 'Buscar por nombre, teléfono, email o interés...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl text-[13px] outline-none transition-all focus:shadow-sm"
          style={{ background: '#fff', border: '1px solid #e8ecf4', color: '#1a1a2e' }}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-[13px]" style={{ color: '#94a3b8' }}>
          {L('Carregando...', 'Loading...', 'Cargando...')}
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
            {search ? L('Nenhum lead arquivado encontrado', 'No archived leads found', 'Ningún lead archivado encontrado') : L('Nenhum lead arquivado', 'No archived leads', 'Ningún lead archivado')}
          </p>
          <p className="text-[12px]" style={{ color: '#94a3b8' }}>
            {search ? L('Tente outra busca.', 'Try another search.', 'Intenta otra búsqueda.') : L('Quando você arquivar leads, eles aparecem aqui.', 'When you archive leads, they show up here.', 'Cuando archives leads, aparecerán aquí.')}
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
                    {l.name || L('Sem nome', 'No name', 'Sin nombre')}
                  </p>
                  {l.contract_closed && (
                    <span
                      className="text-[10px] font-extrabold px-1.5 py-0.5 rounded"
                      style={{ background: '#dcfce7', color: '#15803d' }}
                    >
                      {L('FECHADO', 'CLOSED', 'CERRADO')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px]" style={{ color: '#64748b' }}>
                  {l.phone && <span>📱 {l.phone}</span>}
                  {l.city && <span>📍 {l.city}{l.state ? `/${l.state}` : ''}</span>}
                  {l.interest && <span className="truncate">💡 {l.interest}</span>}
                </div>
                <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>
                  {L('Arquivado', 'Archived', 'Archivado')} {timeSinceArchived(l.archived_at, t._locale)}
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
                  L('Reativando...', 'Reactivating...', 'Reactivando...')
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    {L('Reativar', 'Reactivate', 'Reactivar')}
                  </>
                )}
              </button>
              <button
                onClick={() => deleteForever(l)}
                disabled={deleting === l.id || reactivating === l.id}
                title={L('Excluir definitivamente — não dá pra desfazer', 'Delete permanently — cannot be undone', 'Eliminar definitivamente — no se puede deshacer')}
                className="px-4 py-2 rounded-xl text-[12px] font-bold transition-all hover:shadow-sm disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}
              >
                {deleting === l.id ? (
                  L('Excluindo...', 'Deleting...', 'Eliminando...')
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    {L('Excluir', 'Delete', 'Eliminar')}
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
