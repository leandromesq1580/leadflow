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
  stageColor?: string
}

function timeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `${Math.floor(s / 60)}min`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export function LeadCard({ pipelineLeadId, lead, onClick, stageColor }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pipelineLeadId,
    data: { lead },
  })

  const cardStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: '#fff',
    borderRadius: 14,
    padding: '14px 16px',
    marginBottom: 8,
    cursor: 'grab',
    borderLeft: `3px solid ${stageColor || '#6366f1'}`,
    boxShadow: isDragging
      ? '0 12px 28px rgba(99,102,241,0.18), 0 4px 10px rgba(0,0,0,0.06)'
      : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
  }

  const hue = (lead.name.charCodeAt(0) * 47 + (lead.name.charCodeAt(1) || 0) * 23) % 360

  return (
    <div ref={setNodeRef} style={cardStyle} {...attributes} {...listeners} onClick={onClick}>
      {/* Name row */}
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-extrabold text-white flex-shrink-0"
          style={{ background: `hsl(${hue}, 55%, 50%)` }}>
          {lead.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold truncate" style={{ color: '#1a1a2e' }}>{lead.name}</p>
          {lead.interest && (
            <p className="text-[10px] truncate" style={{ color: '#94a3b8' }}>{lead.interest}</p>
          )}
        </div>
      </div>

      {/* Phone */}
      {lead.phone && (
        <div className="flex items-center gap-1.5 mb-2.5 ml-[42px]">
          <span className="text-[10px]">📞</span>
          <span className="text-[12px] font-semibold" style={{ color: '#475569' }}>{lead.phone}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between ml-[42px]">
        <div className="flex items-center gap-1.5">
          {lead.state && (
            <span className="text-[9px] font-bold px-2 py-[3px] rounded-md"
              style={{ background: '#f0f4ff', color: '#4f46e5', letterSpacing: '0.5px' }}>{lead.state}</span>
          )}
          {lead.type === 'hot' && (
            <span className="text-[9px] font-bold px-2 py-[3px] rounded-md"
              style={{ background: '#fef3c7', color: '#b45309' }}>HOT</span>
          )}
          {lead.contract_closed && (
            <span className="text-[9px] font-bold px-2 py-[3px] rounded-md"
              style={{ background: '#dcfce7', color: '#15803d' }}>FECHADO</span>
          )}
        </div>
        <span className="text-[10px] font-medium" style={{ color: '#c0c8d4' }}>{timeAgo(lead.created_at)}</span>
      </div>
    </div>
  )
}
