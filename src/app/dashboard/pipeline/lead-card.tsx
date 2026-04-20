'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getStaleness } from '@/lib/stale-leads'
import { CardAssignMenu } from './card-assign-menu'

interface Lead {
  id: string; name: string; phone: string; state: string; interest: string
  type: string; created_at: string; contract_closed: boolean
  assigned_to_member?: string | null
}

interface TeamMember { id: string; name: string }

interface LastFollowUp {
  type: string
  scheduled_at: string | null
  created_at: string
}

interface Props {
  pipelineLeadId: string
  lead: Lead
  onClick: () => void
  stageColor?: string
  movedAt?: string | null
  unreadCount?: number
  lastFollowUp?: LastFollowUp | null
  teamMembers?: TeamMember[]
  onAssigned?: () => void
}

function timeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `${Math.floor(s / 60)}min`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

const FU_META: Record<string, { icon: string; label: string; bg: string; color: string }> = {
  call:     { icon: '📞', label: 'Ligação',  bg: '#eff6ff', color: '#1d4ed8' },
  meeting:  { icon: '🤝', label: 'Reunião',  bg: '#fef3c7', color: '#92400e' },
  whatsapp: { icon: '💬', label: 'WhatsApp', bg: '#dcfce7', color: '#15803d' },
  email:    { icon: '✉️', label: 'E-mail',   bg: '#f3e8ff', color: '#6b21a8' },
  note:     { icon: '📝', label: 'Nota',     bg: '#f1f5f9', color: '#475569' },
}

function formatFuDate(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}:${mi}`
}

export function LeadCard({ pipelineLeadId, lead, onClick, stageColor, movedAt, unreadCount = 0, lastFollowUp, teamMembers, onAssigned }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pipelineLeadId,
    data: { lead },
  })

  const stale = getStaleness(movedAt)
  const showStale = stale.level !== 'fresh' && !lead.contract_closed
  const borderColor = stale.level === 'critical' ? '#dc2626' : stale.level === 'alert' ? '#ea580c' : (stageColor || '#6366f1')

  const cardStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: '#fff',
    borderRadius: 14,
    padding: '14px 16px',
    marginBottom: 8,
    cursor: 'grab',
    borderLeft: `3px solid ${borderColor}`,
    boxShadow: isDragging
      ? '0 12px 28px rgba(99,102,241,0.18), 0 4px 10px rgba(0,0,0,0.06)'
      : stale.level === 'critical'
      ? '0 0 0 1px rgba(220,38,38,0.2), 0 1px 3px rgba(0,0,0,0.04)'
      : '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
  }

  const hue = (lead.name.charCodeAt(0) * 47 + (lead.name.charCodeAt(1) || 0) * 23) % 360

  return (
    <div ref={setNodeRef} style={{ ...cardStyle, position: 'relative' }} {...attributes} {...listeners} onClick={onClick}>
      {/* Unread badge */}
      {unreadCount > 0 && (
        <div className="absolute flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold text-white"
          style={{
            top: -6, right: -6,
            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
            boxShadow: '0 2px 8px rgba(239,68,68,0.5)',
            minWidth: 22, height: 22, justifyContent: 'center',
            zIndex: 10,
          }}
          title={`${unreadCount} mensagem${unreadCount > 1 ? 's' : ''} não lida${unreadCount > 1 ? 's' : ''}`}>
          💬 {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}

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
        {teamMembers && teamMembers.length > 0 && (
          <CardAssignMenu
            leadId={lead.id}
            members={teamMembers}
            currentMemberId={lead.assigned_to_member}
            onAssigned={onAssigned}
          />
        )}
      </div>

      {/* Phone */}
      {lead.phone && (
        <div className="flex items-center gap-1.5 mb-2.5 ml-[42px]">
          <span className="text-[10px]">📞</span>
          <span className="text-[12px] font-semibold" style={{ color: '#475569' }}>{lead.phone}</span>
        </div>
      )}

      {/* Último follow-up */}
      {lastFollowUp && (() => {
        const meta = FU_META[lastFollowUp.type] || FU_META.note
        const when = lastFollowUp.scheduled_at || lastFollowUp.created_at
        return (
          <div className="flex items-center gap-1.5 mb-2.5 ml-[42px] px-2 py-1 rounded-md"
            style={{ background: meta.bg }}>
            <span className="text-[11px]">{meta.icon}</span>
            <span className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: meta.color }}>
              {meta.label}
            </span>
            <span className="text-[10px] font-semibold" style={{ color: meta.color, opacity: 0.8 }}>
              · {formatFuDate(when)}
            </span>
          </div>
        )
      })()}

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
          {showStale && (
            <span className="text-[9px] font-bold px-2 py-[3px] rounded-md flex items-center gap-1"
              style={{ background: stale.bg, color: stale.color }}>
              {stale.level === 'critical' && '🔥'}
              {stale.level === 'alert' && '⚠️'}
              {stale.label}
            </span>
          )}
        </div>
        <span className="text-[10px] font-medium" style={{ color: '#c0c8d4' }}>{timeAgo(lead.created_at)}</span>
      </div>
    </div>
  )
}
