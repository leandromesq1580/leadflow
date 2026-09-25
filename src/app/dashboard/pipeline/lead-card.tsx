'use client'

import { FollowUpBadge } from '@/components/follow-up-badge'
import type { LastFollowUp } from '@/lib/pipeline-follow-ups'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getStaleness } from '@/lib/stale-leads'
import { CardAssignMenu } from './card-assign-menu'
import { useT } from '@/lib/i18n-client'
import { usePrivacy } from '@/lib/privacy-mode'
import { LeadLanguageBadge } from '@/components/lead-language-badge'
import type { LeadLanguageFields } from '@/lib/lead-message-locale'

interface Lead extends LeadLanguageFields {
  id: string; name: string; phone: string; state: string; interest: string
  type: string; created_at: string; contract_closed: boolean
  assigned_to_member?: string | null
  can_reclaim?: boolean
}

interface TeamMember { id: string; name: string }

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
  onArchived?: () => void
  viewedMemberId?: string | null
}

function timeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return ''
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export function LeadCard({ pipelineLeadId, lead, onClick, stageColor, movedAt, unreadCount = 0, lastFollowUp, teamMembers, onAssigned, onArchived, viewedMemberId }: Props) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const privacy = usePrivacy()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pipelineLeadId,
    data: { lead },
  })

  // Stale considera atividade mais recente: stage move OR último follow-up.
  // Sem isso, lead com follow-up de hoje mas movido há 6 dias mostrava "6d parado".
  const stale = getStaleness(movedAt, lastFollowUp?.scheduled_at, lastFollowUp?.created_at)
  const showStale = stale.level !== 'fresh' && !lead.contract_closed
  const borderColor = stale.level === 'critical' ? '#dc2626' : stale.level === 'alert' ? '#ea580c' : (stageColor || 'var(--accent)')

  const cardStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: 'var(--bg-card)',
    borderRadius: 14,
    padding: '14px 16px',
    marginBottom: 8,
    cursor: 'grab',
    borderLeft: `3px solid ${borderColor}`,
    boxShadow: isDragging
      ? '0 12px 28px rgba(124,58,237,0.18), 0 4px 10px rgba(0,0,0,0.06)'
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
          title={L(
            `${unreadCount} mensagem${unreadCount > 1 ? 's' : ''} não lida${unreadCount > 1 ? 's' : ''}`,
            `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`,
            `${unreadCount} mensaje${unreadCount > 1 ? 's' : ''} sin leer`,
          )}>
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
          <p className="text-[13px] font-bold truncate" style={{ color: 'var(--fg)' }}>{lead.name}</p>
          {lead.interest && (
            <p className="text-[10px] truncate" style={{ color: 'var(--fg-muted)' }}>{lead.interest}</p>
          )}
        </div>
        <CardAssignMenu
          leadId={lead.id}
          members={teamMembers || []}
          currentMemberId={lead.assigned_to_member}
          canReclaim={lead.can_reclaim}
          viewedMemberId={viewedMemberId}
          onAssigned={onAssigned}
          onArchived={onArchived}
        />
      </div>

      <div className="mb-2.5 ml-[42px]"><LeadLanguageBadge lead={lead} /></div>
      {/* Último follow-up registrado, imediatamente abaixo do idioma. */}
      {lastFollowUp && <div className="mb-2.5 ml-[42px] min-w-0"><FollowUpBadge lastFollowUp={lastFollowUp} locale={t._locale} /></div>}

      {/* Phone */}
      {lead.phone && (
        <div className="flex items-center gap-1.5 mb-2.5 ml-[42px]">
          <span className="text-[10px]">📞</span>
          <span className="text-[12px] font-semibold" style={{ color: 'var(--fg-secondary)' }}>{privacy.mask(lead.phone, 'phone')}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between ml-[42px]">
        <div className="flex items-center gap-1.5">
          {lead.state && (
            <span className="text-[9px] font-bold px-2 py-[3px] rounded-md"
              style={{ background: '#f0f4ff', color: '#6d28d9', letterSpacing: '0.5px' }}>{lead.state}</span>
          )}
          {lead.type === 'hot' && (
            <span className="text-[9px] font-bold px-2 py-[3px] rounded-md"
              style={{ background: 'var(--warn-line)', color: '#b45309' }}>{t.card.hot}</span>
          )}
          {lead.contract_closed && (
            <span className="text-[9px] font-bold px-2 py-[3px] rounded-md"
              style={{ background: 'var(--ok-line)', color: '#15803d' }}>{t.card.closed}</span>
          )}
          {showStale && (
            <span className="text-[9px] font-bold px-2 py-[3px] rounded-md flex items-center gap-1"
              style={{ background: stale.bg, color: stale.color }}>
              {stale.level === 'critical' && '🔥'}
              {stale.level === 'alert' && '⚠️'}
              {stale.level === 'warning' ? `${stale.days}d` : t.card.staleDays(stale.days)}
            </span>
          )}
        </div>
        <span className="text-[10px] font-medium" style={{ color: '#c0c8d4' }}>{timeAgo(lead.created_at)}</span>
      </div>
    </div>
  )
}
