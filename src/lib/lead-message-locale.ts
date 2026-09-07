import { META_FORM_LANGUAGES } from './lead-language'

export type LeadMessageLocale = 'pt' | 'es' | 'en'
export interface LeadLanguageFields {
  lead_language?: string | null
  form_name?: string | null
  meta_lead_id?: string | null
}

/** Contact language, never the producer's interface locale or the lead's name/state. */
export function leadMessageLocale(lead: LeadLanguageFields | null | undefined): LeadMessageLocale | null {
  if (!lead) return null
  if (lead.form_name && META_FORM_LANGUAGES[lead.form_name]) return META_FORM_LANGUAGES[lead.form_name]
  const value = lead.lead_language
  return value === 'pt' || value === 'es' || value === 'en' ? value : null
}

export function requireLeadMessageLocale(lead: LeadLanguageFields): LeadMessageLocale {
  const locale = leadMessageLocale(lead)
  if (!locale) throw new Error('[lead-language] Idioma do lead não identificado. Revise o cadastro antes do envio automático.')
  return locale
}

export function leadMessageLanguageLabel(locale: LeadMessageLocale | null, ui = 'pt'): string {
  const labels = {
    pt: { pt: 'Português', es: 'Espanhol', en: 'Inglês', unknown: 'Idioma não identificado' },
    es: { pt: 'Portugués', es: 'Español', en: 'Inglés', unknown: 'Idioma no identificado' },
    en: { pt: 'Portuguese', es: 'Spanish', en: 'English', unknown: 'Language not identified' },
  }
  return labels[ui === 'en' || ui === 'es' ? ui : 'pt'][locale || 'unknown']
}

/** Product/contact language in delivery alerts; never infer nationality from a name. */
export function leadNotificationLanguageLabel(lead: LeadLanguageFields, ui = 'pt'): string {
  const locale = leadMessageLocale(lead)
  if (!locale) return `🌐 ${leadMessageLanguageLabel(null, ui)}`
  const labels = {
    pt: { pt: '🇧🇷 Lead BR (português)', es: '🇪🇸 Lead em espanhol', en: '🇺🇸 Lead em inglês' },
    es: { pt: '🇧🇷 Lead BR (portugués)', es: '🇪🇸 Lead en español', en: '🇺🇸 Lead en inglés' },
    en: { pt: '🇧🇷 BR lead (Portuguese)', es: '🇪🇸 Spanish-speaking lead', en: '🇺🇸 English-speaking lead' },
  }
  return labels[ui === 'en' || ui === 'es' ? ui : 'pt'][locale]
}
