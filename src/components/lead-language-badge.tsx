'use client'

import { useT } from '@/lib/i18n-client'
import { leadMessageLocale, leadMessageLanguageLabel, type LeadLanguageFields } from '@/lib/lead-message-locale'

export function LeadLanguageBadge({ lead }: { lead: LeadLanguageFields | null | undefined }) {
  const t = useT()
  const locale = leadMessageLocale(lead)
  const label = leadMessageLanguageLabel(locale, t._locale)
  return (
    <span data-lead-language={locale || 'unknown'}
      title={label}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-extrabold leading-tight"
      style={{ background: locale === 'es' ? '#fef3c7' : locale === 'en' ? '#dbeafe' : locale === 'pt' ? '#dcfce7' : '#fee2e2', color: locale === 'es' ? '#92400e' : locale === 'en' ? '#1e40af' : locale === 'pt' ? '#166534' : '#991b1b' }}>
      <span aria-hidden="true" className="text-[15px] leading-none">{locale === 'pt' ? '🇧🇷' : locale === 'es' ? '🇪🇸' : '🌐'}</span> {locale && `${locale.toUpperCase()} · `}{label}
    </span>
  )
}
