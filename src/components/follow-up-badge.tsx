'use client'

import { usePrivacy } from '@/lib/privacy-mode'
import type { LastFollowUp } from '@/lib/pipeline-follow-ups'

const FU_META_BY_LOCALE = {
  pt: {
    call:     { label: 'Ligação' },
    meeting:  { label: 'Reunião' },
    whatsapp: { label: 'WhatsApp' },
    email:    { label: 'E-mail' },
    note:     { label: 'Nota' },
  },
  en: {
    call:     { label: 'Call' },
    meeting:  { label: 'Meeting' },
    whatsapp: { label: 'WhatsApp' },
    email:    { label: 'Email' },
    note:     { label: 'Note' },
  },
  es: {
    call:     { label: 'Llamada' },
    meeting:  { label: 'Reunión' },
    whatsapp: { label: 'WhatsApp' },
    email:    { label: 'Email' },
    note:     { label: 'Nota' },
  },
}

const FU_COLOR: Record<string, { icon: string; bg: string; color: string }> = {
  call:     { icon: '📞', bg: '#eff6ff', color: '#1d4ed8' },
  meeting:  { icon: '🤝', bg: 'var(--warn-line)', color: '#92400e' },
  whatsapp: { icon: '💬', bg: 'var(--ok-line)', color: '#15803d' },
  email:    { icon: '✉️', bg: '#f3e8ff', color: '#6b21a8' },
  note:     { icon: '📝', bg: 'var(--bg-soft)', color: 'var(--fg-secondary)' },
}

// Horario Eastern (EUA) em AM/PM — o lead mora nos EUA, nao no Brasil
const LEAD_TZ = 'America/New_York'
function formatFuDate(iso: string, locale: string): string {
  const d = new Date(iso)
  // PT mantém dd/mm (en-GB); EN vê mm/dd (en-US); ES segue es-US
  const dateLocale = locale === 'en' ? 'en-US' : locale === 'es' ? 'es-US' : 'en-GB'
  const dateStr = d.toLocaleDateString(dateLocale, { timeZone: LEAD_TZ, day: '2-digit', month: '2-digit' }) // 21/04
  const timeStr = d.toLocaleTimeString('en-US', { timeZone: LEAD_TZ, hour: 'numeric', minute: '2-digit', hour12: true }) // 6:00 PM
  return `${dateStr} ${timeStr}`
}

export function FollowUpBadge({ lastFollowUp, locale }: { lastFollowUp?: LastFollowUp | null; locale: string }) {
  const privacy = usePrivacy()
  const description = privacy.enabled ? '' : lastFollowUp?.description?.trim() || ''
  const expandLabel = locale === 'en' ? 'Read full text' : locale === 'es' ? 'Ver texto completo' : 'Ver texto completo'
  const collapseLabel = locale === 'en' ? 'Collapse text' : locale === 'es' ? 'Contraer texto' : 'Recolher texto'
  const t = { _locale: locale }
  return <>
      {lastFollowUp && (() => {
        const color = FU_COLOR[lastFollowUp.type] || FU_COLOR.note
        const labels = FU_META_BY_LOCALE[t._locale as keyof typeof FU_META_BY_LOCALE] || FU_META_BY_LOCALE.pt
        const label = labels[lastFollowUp.type as keyof typeof labels]?.label || labels.note.label
        const when = lastFollowUp.scheduled_at || lastFollowUp.created_at
        return (
          <div className="flex items-center gap-1.5 flex-wrap px-2 py-1 rounded-md"
            style={{ background: color.bg }}>
            <span className="text-[11px]">{color.icon}</span>
            <span className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: color.color }}>
              {label}
            </span>
            <span className="text-[10px] font-semibold" style={{ color: color.color, opacity: 0.8 }}>
              · {formatFuDate(when, t._locale)}
            </span>
            {description && (
              <details className="group w-full min-w-0 text-xs" style={{ color: color.color, overflowWrap: 'anywhere' }}
                onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                <summary className="cursor-pointer list-none rounded focus-visible:outline-2 focus-visible:outline-offset-2">
                  <span className="block whitespace-pre-wrap line-clamp-3 group-open:hidden">{description.length > 240 ? `${description.slice(0, 240)}…` : description}</span>
                  <span className="block mt-1 text-[10px] underline group-open:hidden">{expandLabel}</span>
                  <span className="hidden text-[10px] underline group-open:block">{collapseLabel}</span>
                </summary>
                <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap" tabIndex={0}>{description}</p>
              </details>
            )}
          </div>
        )
      })()}

  </>
}
