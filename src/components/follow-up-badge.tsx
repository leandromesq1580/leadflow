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
          </div>
        )
      })()}

  </>
}
