'use client'

import { useState, useEffect, useCallback } from 'react'
import { DndContext, DragEndEvent, DragOverEvent, PointerSensor, useSensor, useSensors, closestCorners, DragOverlay, DragStartEvent } from '@dnd-kit/core'
import { KanbanColumn } from './kanban-column'
import { LeadCard } from './lead-card'
import { LeadModal } from './lead-modal'
import Link from 'next/link'

interface Stage { id: string; name: string; color: string; position: number }
interface Pipeline { id: string; name: string; is_default: boolean; stages: Stage[] }
interface PipelineLead {
  id: string; stage_id: string; position: number; moved_at?: string | null
  lead: { id: string; name: string; phone: string; state: string; interest: string; type: string; created_at: string; contract_closed: boolean; email: string }
}

export default function PipelinePage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(null)
  const [leads, setLeads] = useState<PipelineLead[]>([])
  const [loading, setLoading] = useState(true)
  const [buyerId, setBuyerId] = useState('')
  const [selectedLead, setSelectedLead] = useState<PipelineLead | null>(null)
  const [activeCard, setActiveCard] = useState<PipelineLead | null>(null)
  const [creating, setCreating] = useState(false)
  const [view, setView] = useState<'mine' | 'team'>('mine')
  const [teamLeads, setTeamLeads] = useState<any[]>([])
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [isAgency, setIsAgency] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [closedOnly, setClosedOnly] = useState(false)
  const [staleOnly, setStaleOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    if (cookie) {
      try {
        const token = JSON.parse(atob(cookie.split('=')[1]))
        const payload = JSON.parse(atob(token.access_token.split('.')[1]))
        fetchBuyer(payload.sub)
      } catch {}
    }
  }, [])

  async function fetchBuyer(authId: string) {
    const r = await fetch(`/api/settings?auth_user_id=${authId}`)
    const buyer = await r.json()
    setBuyerId(buyer.id)
    setIsAgency(buyer.is_agency || false)
    loadPipelines(buyer.id)
    if (buyer.is_agency) loadTeamData(buyer.id)
  }

  async function loadTeamData(bid: string) {
    const [membersRes, leadsRes] = await Promise.all([
      fetch(`/api/team/members?auth_user_id=&buyer_id=${bid}`),
      fetch(`/api/team/leads?buyer_id=${bid}`),
    ])
    const membersData = await membersRes.json()
    const leadsData = await leadsRes.json()
    setTeamMembers(membersData.members || [])
    setTeamLeads(leadsData.leads || [])
  }

  async function loadPipelines(bid: string) {
    setLoading(true)
    const r = await fetch(`/api/pipelines?buyer_id=${bid}`)
    const d = await r.json()
    const pipes = d.pipelines || []
    setPipelines(pipes)

    if (pipes.length > 0) {
      const active = pipes.find((p: Pipeline) => p.is_default) || pipes[0]
      setActivePipeline(active)
      loadLeads(active.id)
    }
    setLoading(false)
  }

  async function loadLeads(pipelineId: string) {
    const r = await fetch(`/api/pipelines/${pipelineId}/leads`)
    const d = await r.json()
    setLeads(d.leads || [])
  }

  async function createPipeline() {
    setCreating(true)
    await fetch('/api/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyer_id: buyerId, name: 'Vendas' }),
    })
    loadPipelines(buyerId)
    setCreating(false)
  }

  const filteredLeads = leads.filter(l => {
    if (search) {
      const q = search.toLowerCase()
      if (!l.lead.name.toLowerCase().includes(q) && !l.lead.email?.toLowerCase().includes(q) && !l.lead.phone?.includes(q)) return false
    }
    if (filterStage && l.stage_id !== filterStage) return false
    if (closedOnly && !l.lead.contract_closed) return false
    if (staleOnly) {
      const movedAt = l.moved_at ? new Date(l.moved_at).getTime() : 0
      if (Date.now() - movedAt < 3 * 86400000 || l.lead.contract_closed) return false
    }
    if (filterDate) {
      const created = new Date(l.lead.created_at).getTime()
      const now = Date.now()
      if (filterDate === '7d' && now - created > 7 * 86400000) return false
      if (filterDate === '30d' && now - created > 30 * 86400000) return false
      if (filterDate === '90d' && now - created > 90 * 86400000) return false
    }
    return true
  })

  const hasFilters = !!(search || filterStage || filterDate || closedOnly || staleOnly)
  const staleCount = leads.filter(l => {
    if (l.lead.contract_closed) return false
    const movedAt = l.moved_at ? new Date(l.moved_at).getTime() : 0
    return Date.now() - movedAt >= 3 * 86400000
  }).length

  const getStageLeads = useCallback((stageId: string) => {
    return filteredLeads.filter(l => l.stage_id === stageId).sort((a, b) => a.position - b.position)
  }, [filteredLeads])

  function handleDragStart(event: DragStartEvent) {
    const item = leads.find(l => l.id === event.active.id)
    setActiveCard(item || null)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const activeItem = leads.find(l => l.id === active.id)
    if (!activeItem) return
    let targetStageId: string | null = null
    const stage = activePipeline?.stages.find(s => s.id === over.id)
    if (stage) {
      targetStageId = stage.id
    } else {
      const overItem = leads.find(l => l.id === over.id)
      if (overItem) targetStageId = overItem.stage_id
    }
    if (targetStageId && targetStageId !== activeItem.stage_id) {
      setLeads(prev => prev.map(l => l.id === activeItem.id ? { ...l, stage_id: targetStageId! } : l))
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null)
    const { active } = event
    const item = leads.find(l => l.id === active.id)
    if (!item) return
    await fetch(`/api/pipeline-leads/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: item.stage_id, position: 0 }),
    })
  }

  // Empty state — no pipelines
  if (!loading && pipelines.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
            style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)' }}>
            <span className="text-[36px]">📋</span>
          </div>
          <h1 className="text-[24px] font-extrabold mb-2" style={{ color: '#1a1a2e' }}>Pipeline de Vendas</h1>
          <p className="text-[14px] mb-8 leading-relaxed" style={{ color: '#94a3b8' }}>
            Gerencie seus leads visualmente com Kanban.<br/>Arraste entre estagios conforme avanca a venda.
          </p>
          <button onClick={createPipeline} disabled={creating}
            className="px-8 py-3.5 rounded-xl text-[14px] font-bold text-white disabled:opacity-50 transition-all hover:shadow-lg"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
            {creating ? 'Criando...' : 'Criar Meu Pipeline'}
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#6366f1', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const totalLeads = leads.length
  const closedLeads = leads.filter(l => l.lead.contract_closed).length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Pipeline</h1>
            {pipelines.length > 1 && (
              <select value={activePipeline?.id || ''} onChange={e => {
                const p = pipelines.find(pp => pp.id === e.target.value)
                if (p) { setActivePipeline(p); loadLeads(p.id) }
              }}
                className="px-3 py-1.5 rounded-lg text-[13px] font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-200"
                style={{ border: '1px solid #e8ecf4', color: '#1a1a2e', background: '#fff' }}>
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[12px] font-semibold" style={{ color: '#94a3b8' }}>
              {totalLeads} leads
            </span>
            {closedLeads > 0 && (
              <span className="text-[12px] font-bold px-2 py-0.5 rounded-md" style={{ background: '#dcfce7', color: '#15803d' }}>
                {closedLeads} fechados
              </span>
            )}
            {staleCount > 0 && (
              <button onClick={() => { setStaleOnly(true); setShowFilters(true) }}
                className="text-[12px] font-bold px-2 py-0.5 rounded-md transition-all hover:shadow-sm"
                style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa' }}>
                ⚠️ {staleCount} parado{staleCount > 1 ? 's' : ''} 3+ dias
              </button>
            )}
          </div>
        </div>
        <Link href="/dashboard/pipeline/settings"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold transition-all hover:shadow-sm"
          style={{ background: '#fff', color: '#64748b', border: '1px solid #e8ecf4' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M3 12h18"/></svg>
          Gerenciar
        </Link>
      </div>

      {/* View toggle (agency only) */}
      {isAgency && (
        <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: '#f1f5f9', display: 'inline-flex' }}>
          <button onClick={() => setView('mine')}
            className="px-5 py-2 rounded-lg text-[12px] font-bold transition-all"
            style={{ background: view === 'mine' ? '#fff' : 'transparent', color: view === 'mine' ? '#6366f1' : '#94a3b8',
              boxShadow: view === 'mine' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none' }}>
            Meu Pipeline
          </button>
          <button onClick={() => { setView('team'); if (buyerId) loadTeamData(buyerId) }}
            className="px-5 py-2 rounded-lg text-[12px] font-bold transition-all"
            style={{ background: view === 'team' ? '#fff' : 'transparent', color: view === 'team' ? '#6366f1' : '#94a3b8',
              boxShadow: view === 'team' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none' }}>
            Meu Time ({teamLeads.length})
          </button>
        </div>
      )}

      {/* Team view */}
      {view === 'team' && isAgency && (
        <div className="space-y-4 mb-6">
          {teamMembers.filter(m => m.is_active).map(member => {
            const mLeads = teamLeads.filter((l: any) => l.assigned_to_member === member.id)
            return (
              <div key={member.id} className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
                <div className="flex items-center gap-3 px-5 py-3" style={{ background: '#f8f9fc', borderBottom: '1px solid #e8ecf4' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ background: '#6366f1' }}>
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>{member.name}</p>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ background: '#eef2ff', color: '#6366f1' }}>
                    {mLeads.length} leads
                  </span>
                </div>
                {mLeads.length === 0 ? (
                  <p className="text-center py-6 text-[12px]" style={{ color: '#c0c8d4' }}>Nenhum lead atribuido</p>
                ) : (
                  <div>
                    {mLeads.map((l: any, i: number) => (
                      <div key={l.id} className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50"
                        style={{ borderBottom: i < mLeads.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                        onClick={() => setSelectedLead({ id: '', stage_id: '', position: 0, lead: l })}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ background: `hsl(${(l.name.charCodeAt(0) * 47) % 360}, 55%, 50%)` }}>
                          {l.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{l.name}</p>
                          <p className="text-[11px]" style={{ color: '#94a3b8' }}>{l.interest}</p>
                        </div>
                        <span className="text-[12px] font-semibold" style={{ color: '#6366f1' }}>{l.phone}</span>
                        {l.contract_closed && (
                          <span className="text-[9px] font-bold px-2 py-1 rounded-md" style={{ background: '#dcfce7', color: '#15803d' }}>FECHADO</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {view === 'mine' && <>
      {/* Filters */}
      <div className="rounded-xl mb-5 overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <div className="flex items-center justify-between px-4 py-2.5">
          <button onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-[12px] font-bold" style={{ color: showFilters ? '#6366f1' : '#94a3b8' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
            Filtros
            {hasFilters && <span className="w-2 h-2 rounded-full" style={{ background: '#6366f1' }} />}
          </button>
          <div className="flex items-center gap-3">
            {hasFilters && (
              <button onClick={() => { setSearch(''); setFilterStage(''); setFilterDate(''); setClosedOnly(false); setStaleOnly(false) }}
                className="text-[11px] font-semibold flex items-center gap-1" style={{ color: '#ef4444' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                Limpar filtros
              </button>
            )}
            <span className="text-[11px] font-semibold" style={{ color: '#94a3b8' }}>
              {filteredLeads.length}/{leads.length} leads
            </span>
          </div>
        </div>

        {showFilters && (
          <div className="px-4 pb-4 pt-1 flex flex-wrap gap-3 items-end" style={{ borderTop: '1px solid #f1f5f9' }}>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#c0c8d4' }}>Buscar</label>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome, email ou telefone..."
                className="w-full px-3 py-2 rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
            </div>
            <div className="min-w-[140px]">
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#c0c8d4' }}>Estagio</label>
              <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }}>
                <option value="">Todos</option>
                {activePipeline?.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="min-w-[120px]">
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#c0c8d4' }}>Periodo</label>
              <select value={filterDate} onChange={e => setFilterDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }}>
                <option value="">Qualquer data</option>
                <option value="7d">Ultimos 7 dias</option>
                <option value="30d">Ultimos 30 dias</option>
                <option value="90d">Ultimos 90 dias</option>
              </select>
            </div>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer"
              style={{ background: closedOnly ? '#f0fdf4' : '#f8f9fc', border: `1px solid ${closedOnly ? '#86efac' : '#e8ecf4'}` }}>
              <input type="checkbox" checked={closedOnly} onChange={e => setClosedOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-green-500" />
              <span className="text-[11px] font-bold" style={{ color: closedOnly ? '#15803d' : '#94a3b8' }}>Fechados</span>
            </label>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer"
              style={{ background: staleOnly ? '#fff7ed' : '#f8f9fc', border: `1px solid ${staleOnly ? '#fed7aa' : '#e8ecf4'}` }}>
              <input type="checkbox" checked={staleOnly} onChange={e => setStaleOnly(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-orange-500" />
              <span className="text-[11px] font-bold" style={{ color: staleOnly ? '#ea580c' : '#94a3b8' }}>⚠️ Parados 3+ dias</span>
            </label>
          </div>
        )}
      </div>

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-6 -mx-4 px-4" style={{ scrollbarWidth: 'thin' }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4" style={{ minWidth: (activePipeline?.stages.length || 1) * 306 }}>
            {activePipeline?.stages.map(stage => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                items={getStageLeads(stage.id)}
                onLeadClick={(item) => setSelectedLead(item)}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeCard && (
              <div style={{ width: 274, transform: 'rotate(2deg)' }}>
                <LeadCard pipelineLeadId={activeCard.id} lead={activeCard.lead} movedAt={activeCard.moved_at} onClick={() => {}} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      </>}

      {/* Lead Modal */}
      {selectedLead && (
        <LeadModal
          leadId={selectedLead.lead.id}
          buyerId={buyerId}
          onClose={() => setSelectedLead(null)}
          onSaved={() => { setSelectedLead(null); if (activePipeline) loadLeads(activePipeline.id); if (isAgency) loadTeamData(buyerId) }}
        />
      )}
    </div>
  )
}
