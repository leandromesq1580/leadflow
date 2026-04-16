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
    <div className="flex-shrink-0 w-[280px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-3 h-3 rounded-full" style={{ background: stage.color }} />
        <h3 className="text-[13px] font-bold" style={{ color: '#1a1a2e' }}>{stage.name}</h3>
        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#f1f5f9', color: '#64748b' }}>
          {items.length}
        </span>
      </div>

      {/* Column body */}
      <div
        ref={setNodeRef}
        className="rounded-xl p-2 min-h-[200px] transition-colors"
        style={{
          background: isOver ? 'rgba(99,102,241,0.06)' : '#f8f9fc',
          border: isOver ? '2px dashed #6366f1' : '2px dashed transparent',
        }}
      >
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.map(item => (
            <LeadCard
              key={item.id}
              pipelineLeadId={item.id}
              lead={item.lead}
              onClick={() => onLeadClick(item)}
            />
          ))}
        </SortableContext>

        {items.length === 0 && (
          <p className="text-center text-[11px] py-8" style={{ color: '#c0c8d4' }}>
            Arraste leads aqui
          </p>
        )}
      </div>
    </div>
  )
}
