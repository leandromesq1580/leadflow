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
  id: string; stage_id: string; position: number
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
    loadPipelines(buyer.id)
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

  const getStageLeads = useCallback((stageId: string) => {
    return leads.filter(l => l.stage_id === stageId).sort((a, b) => a.position - b.position)
  }, [leads])

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
          </div>
        </div>
        <Link href="/dashboard/pipeline/settings"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold transition-all hover:shadow-sm"
          style={{ background: '#fff', color: '#64748b', border: '1px solid #e8ecf4' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M3 12h18"/></svg>
          Gerenciar
        </Link>
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
                <LeadCard pipelineLeadId={activeCard.id} lead={activeCard.lead} onClick={() => {}} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Lead Modal */}
      {selectedLead && (
        <LeadModal
          leadId={selectedLead.lead.id}
          buyerId={buyerId}
          onClose={() => setSelectedLead(null)}
          onSaved={() => { setSelectedLead(null); if (activePipeline) loadLeads(activePipeline.id) }}
        />
      )}
    </div>
  )
}
