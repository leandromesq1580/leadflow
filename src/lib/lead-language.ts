/** Product language is independent of the language used to display the portal. */
export const LEAD_LANGUAGES = ['pt', 'es'] as const
export type LeadLanguage = typeof LEAD_LANGUAGES[number]

export const META_FORM_LANGUAGES: Record<string, LeadLanguage> = {
  '25952858404333766': 'pt',
  '1963007337624994': 'es',
}

export function isLeadLanguage(value: unknown): value is LeadLanguage {
  return value === 'pt' || value === 'es'
}

export function leadLanguageLabel(language: LeadLanguage, locale = 'pt'): string {
  if (language === 'es') return locale === 'en' ? 'Spanish-speaking leads' : locale === 'es' ? 'Leads en español' : 'Leads em espanhol'
  return locale === 'en' ? 'BR leads (Portuguese)' : locale === 'es' ? 'Leads BR (portugués)' : 'Leads BR (português)'
}

export function leadLanguageForLead(lead: {
  lead_language?: string | null
  form_name?: string | null
  meta_lead_id?: string | null
}): LeadLanguage | null {
  // The known form is authoritative, including during a rolling deployment.
  if (lead.form_name && META_FORM_LANGUAGES[lead.form_name]) return META_FORM_LANGUAGES[lead.form_name]
  if (isLeadLanguage(lead.lead_language)) return lead.lead_language
  // Unknown Meta forms must be reviewed, never guessed from a name/phone/state.
  return lead.meta_lead_id ? null : 'pt'
}

export function purchaseLeadLanguage(value: unknown): LeadLanguage | null {
  // Only already-open legacy Stripe sessions may omit this metadata.
  return value == null || value === '' ? 'pt' : isLeadLanguage(value) ? value : null
}
