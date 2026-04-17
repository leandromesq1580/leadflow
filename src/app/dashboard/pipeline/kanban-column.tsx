'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { LeadCard } from './lead-card'

interface Stage {
  id: string; name: string; color: string; position: number
}

interface PipelineLead {
  id: string
  stage_id: string
  moved_at?: string | null
  lead: { id: string; name: string; phone: string; state: string; interest: string; type: string; created_at: string; contract_closed: boolean }
}

interface Props {
  stage: Stage
  items: PipelineLead[]
  onLeadClick: (lead: PipelineLead) => void
}

export function KanbanColumn({ stage, items, onLeadClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  return (
    <div className="flex-shrink-0 w-[290px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color, boxShadow: `0 0 8px ${stage.color}40` }} />
          <h3 className="text-[13px] font-bold tracking-tight" style={{ color: '#1a1a2e' }}>{stage.name}</h3>
        </div>
        <span className="text-[11px] font-extrabold w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: `${stage.color}15`, color: stage.color }}>
          {items.length}
        </span>
      </div>

      {/* Top accent bar */}
      <div className="h-[3px] rounded-t-xl mb-0" style={{ background: `linear-gradient(90deg, ${stage.color}, ${stage.color}60)` }} />

      {/* Column body */}
      <div
        ref={setNodeRef}
        className="rounded-b-xl p-2.5 min-h-[calc(100vh-220px)] transition-all duration-200"
        style={{
          background: isOver ? `${stage.color}08` : '#f4f6f9',
          border: isOver ? `2px dashed ${stage.color}50` : '2px solid transparent',
          borderTop: 'none',
        }}
      >
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.map(item => (
            <LeadCard
              key={item.id}
              pipelineLeadId={item.id}
              lead={item.lead}
              stageColor={stage.color}
              movedAt={item.moved_at}
              onClick={() => onLeadClick(item)}
            />
          ))}
        </SortableContext>

        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ background: `${stage.color}10` }}>
              <span className="text-[16px]" style={{ opacity: 0.4 }}>📋</span>
            </div>
            <p className="text-[11px] font-medium" style={{ color: '#c0c8d4' }}>Arraste leads aqui</p>
          </div>
        )}
      </div>
    </div>
  )
}
