import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ReassignControl } from './reassign-control'
import { AppointmentModal } from './appointment-modal'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

function getLeadAge(createdAt: string): { days: number; label: string; color: string; bg: string } {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return { days, label: 'Hoje', color: '#10b981', bg: '#ecfdf5' }
  if (days <= 3) return { days, label: `${days}d`, color: '#10b981', bg: '#ecfdf5' }
  if (days <= 7) return { days, label: `${days}d`, color: '#f59e0b', bg: '#fffbeb' }
  return { days, label: `${days}d`, color: '#ef4444', bg: '#fef2f2' }
}

interface SearchParams {
  page?: string
  q?: string
  status?: string
  type?: string
  state?: string
  buyer?: string
}

export default async function AdminLeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)
  const q = (sp.q || '').trim()
  const status = sp.status || ''
  const type = sp.type || ''
  const state = (sp.state || '').toUpperCase().slice(0, 2)
  const buyerFilter = sp.buyer || ''

  const db = createAdminClient()

  // Query principal de leads (com filtros e paginação)
  function applyFilters(builder: any) {
    if (q) {
      // busca em nome, phone, email, city, meta_lead_id
      builder = builder.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,city.ilike.%${q}%,meta_lead_id.ilike.%${q}%`)
    }
    if (status) builder = builder.eq('status', status)
    if (type) builder = builder.eq('type', type)
    if (state) builder = builder.eq('state', state)
    if (buyerFilter === 'unassigned') builder = builder.is('assigned_to', null)
    else if (buyerFilter) builder = builder.eq('assigned_to', buyerFilter)
    return builder
  }

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // Listar
  let listQuery = db.from('leads').select('*, buyer:buyers!assigned_to(name)', { count: 'exact' })
  listQuery = applyFilters(listQuery)
  listQuery = listQuery.order('created_at', { ascending: false }).range(from, to)
  const { data: leads, count: totalFiltered } = await listQuery

  // Contagens GLOBAIS (sem filtros, pra cabeçalho)
  const [
    { count: totalAll },
    { count: totalNew },
    { count: totalSold },
    { count: totalCold },
  ] = await Promise.all([
    db.from('leads').select('id', { count: 'exact', head: true }),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    db.from('leads').select('id', { count: 'exact', head: true }).neq('status', 'new'),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('type', 'cold').eq('status', 'new'),
  ])

  // Buyers pra dropdown
  const { data: buyers } = await db.from('buyers').select('id, name').eq('is_active', true).order('name')

  const allLeads = leads || []
  const total = totalFiltered ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasActiveFilter = !!(q || status || type || state || buyerFilter)

  function buildQS(overrides: Record<string, string | undefined>) {
    const params: Record<string, string> = {}
    if (q) params.q = q
    if (status) params.status = status
    if (type) params.type = type
    if (state) params.state = state
    if (buyerFilter) params.buyer = buyerFilter
    if (page > 1) params.page = String(page)
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === '') delete params[k]
      else params[k] = v
    }
    const qs = new URLSearchParams(params).toString()
    return qs ? `?${qs}` : ''
  }

  return (
    <div className="max-w-[1200px]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Todos os Leads</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>
            <strong>{totalAll ?? 0}</strong> total · {totalSold ?? 0} vendidos · {(totalNew ?? 0) - (totalCold ?? 0)} quentes na fila · {totalCold ?? 0} frios
          </p>
        </div>
        <Link href="/admin/import" className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white" style={{ background: '#6366f1' }}>
          📥 Importar do Google Sheets
        </Link>
      </div>

      {/* Filtros */}
      <form action="/admin/leads" method="get" className="mb-4 p-4 rounded-2xl flex flex-wrap items-end gap-3" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: '#94a3b8' }}>Buscar</label>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Nome, telefone, email, cidade..."
            className="w-full px-3 py-2 rounded-lg text-[13px]"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }}
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: '#94a3b8' }}>Status</label>
          <select name="status" defaultValue={status} className="px-3 py-2 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }}>
            <option value="">Todos</option>
            <option value="new">Novo</option>
            <option value="assigned">Atribuído</option>
            <option value="qualified">Qualificado</option>
            <option value="appointment_set">Reunião agendada</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: '#94a3b8' }}>Temperatura</label>
          <select name="type" defaultValue={type} className="px-3 py-2 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }}>
            <option value="">Todos</option>
            <option value="hot">🔥 Hot</option>
            <option value="cold">❄️ Cold</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: '#94a3b8' }}>Estado</label>
          <input
            type="text"
            name="state"
            defaultValue={state}
            maxLength={2}
            placeholder="FL"
            className="w-[70px] px-3 py-2 rounded-lg text-[13px] uppercase"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }}
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: '#94a3b8' }}>Comprador</label>
          <select name="buyer" defaultValue={buyerFilter} className="px-3 py-2 rounded-lg text-[13px]" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e', minWidth: 160 }}>
            <option value="">Todos</option>
            <option value="unassigned">— Sem dono —</option>
            {(buyers || []).map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="px-5 py-2 rounded-lg text-[13px] font-bold text-white" style={{ background: '#6366f1' }}>
          Filtrar
        </button>
        {hasActiveFilter && (
          <Link href="/admin/leads" className="px-3 py-2 text-[12px] font-bold" style={{ color: '#94a3b8' }}>
            Limpar
          </Link>
        )}
      </form>

      {/* Resumo do filtro atual */}
      {hasActiveFilter && (
        <p className="mb-3 text-[12px]" style={{ color: '#64748b' }}>
          Filtro retornou <strong style={{ color: '#1a1a2e' }}>{total}</strong> {total === 1 ? 'lead' : 'leads'} · página {page} de {totalPages}
        </p>
      )}
      {!hasActiveFilter && (
        <p className="mb-3 text-[12px]" style={{ color: '#64748b' }}>
          Página {page} de {totalPages} ({total} leads)
        </p>
      )}

      {/* Tabela */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <div className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid #e8ecf4', background: '#f8f9fc' }}>
          <span className="w-9" />
          <span className="flex-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Lead</span>
          <span className="w-[40px] text-[11px] font-bold uppercase tracking-wider text-center" style={{ color: '#94a3b8' }}>Estado</span>
          <span className="w-[50px] text-[11px] font-bold uppercase tracking-wider text-center" style={{ color: '#94a3b8' }}>Idade</span>
          <span className="w-[40px] text-[11px] font-bold uppercase tracking-wider text-center" style={{ color: '#94a3b8' }}>Temp</span>
          <span className="min-w-[100px] text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Comprador</span>
          <span className="w-[70px] text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Status</span>
        </div>
        {allLeads.length > 0 ? (
          <div>
            {allLeads.map((lead: any, i: number) => {
              const age = getLeadAge(lead.created_at)
              return (
                <div key={lead.id} className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: i < allLeads.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold text-white" style={{ background: `hsl(${(lead.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
                    {getInitials(lead.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <AppointmentModal leadId={lead.id} leadName={lead.name} agents={buyers || []} />
                    <p className="text-[11px]" style={{ color: '#94a3b8' }}>{lead.phone}{lead.city ? ` · ${lead.city}` : ''}</p>
                  </div>
                  <span className="w-[40px] text-center px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: '#eef2ff', color: '#6366f1' }}>
                    {lead.state || '?'}
                  </span>
                  <span className="w-[50px] text-center px-2 py-1 rounded-lg text-[11px] font-bold" style={{ background: age.bg, color: age.color }}>
                    {age.label}
                  </span>
                  <span className="w-[40px] text-center">
                    {lead.type === 'cold' ? (
                      <span className="text-[11px] font-bold" style={{ color: '#3b82f6' }}>❄️</span>
                    ) : (
                      <span className="text-[11px] font-bold" style={{ color: '#ef4444' }}>🔥</span>
                    )}
                  </span>
                  <span className="min-w-[100px]">
                    <ReassignControl leadId={lead.id} currentName={lead.buyer?.name || null} agents={buyers || []} />
                  </span>
                  <span className="w-[70px]">
                    <Badge status={lead.status} />
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-[13px]" style={{ color: '#94a3b8' }}>
            {hasActiveFilter ? 'Nenhum lead bate com o filtro' : 'Nenhum lead'}
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-[12px]" style={{ color: '#64748b' }}>
            Mostrando {from + 1}–{Math.min(to + 1, total)} de {total}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={`/admin/leads${buildQS({ page: String(page - 1) })}`} className="px-3 py-1.5 rounded-lg text-[12px] font-bold" style={{ background: '#f1f5f9', color: '#1a1a2e' }}>
                ← Anterior
              </Link>
            ) : (
              <span className="px-3 py-1.5 rounded-lg text-[12px] font-bold opacity-40" style={{ background: '#f1f5f9', color: '#94a3b8' }}>← Anterior</span>
            )}
            <span className="text-[12px] font-bold px-3" style={{ color: '#64748b' }}>
              {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={`/admin/leads${buildQS({ page: String(page + 1) })}`} className="px-3 py-1.5 rounded-lg text-[12px] font-bold" style={{ background: '#f1f5f9', color: '#1a1a2e' }}>
                Próxima →
              </Link>
            ) : (
              <span className="px-3 py-1.5 rounded-lg text-[12px] font-bold opacity-40" style={{ background: '#f1f5f9', color: '#94a3b8' }}>Próxima →</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
