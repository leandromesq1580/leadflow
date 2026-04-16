'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Lead {
  id: string; name: string; phone: string; state: string; interest: string
  type: string; created_at: string; contract_closed: boolean
}

interface Props {
  pipelineLeadId: string
  lead: Lead
  onClick: () => void
}

function timeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `${Math.floor(s / 60)}min`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export function LeadCard({ pipelineLeadId, lead, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pipelineLeadId,
    data: { lead },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="rounded-xl p-3 mb-2 cursor-grab active:cursor-grabbing group"
      style2={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', ...style }}
    >
      <div style={{ background: '#fff', border: '1px solid #e8ecf4', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', borderRadius: 12, padding: 12, marginBottom: 0, ...style }}>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
            style={{ background: `hsl(${(lead.name.charCodeAt(0) * 37) % 360}, 65%, 55%)` }}>
            {lead.name.charAt(0).toUpperCase()}
          </div>
          <p className="text-[13px] font-bold truncate" style={{ color: '#1a1a2e' }}>{lead.name}</p>
        </div>
        {lead.phone && (
          <p className="text-[12px] font-semibold mb-1" style={{ color: '#6366f1' }}>{lead.phone}</p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {lead.state && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#eef2ff', color: '#6366f1' }}>{lead.state}</span>
            )}
            {lead.contract_closed && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#dcfce7', color: '#166534' }}>Fechado</span>
            )}
          </div>
          <span className="text-[10px]" style={{ color: '#94a3b8' }}>{timeAgo(lead.created_at)}</span>
        </div>
      </div>
    </div>
  )
}
