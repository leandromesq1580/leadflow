// Read-only audit. Does not start any automation, sequence, SMS or customer send.
import { createClient } from '@supabase/supabase-js'
import { leadMessageLocale } from '../src/lib/lead-message-locale'
import { translateLeadCopy } from '../src/lib/lead-message-template'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const counts: Record<string, number> = {}
let formOverrides = 0
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db.from('leads').select('id,lead_language,form_name,meta_lead_id')
    .order('id').range(offset, offset + 999)
  if (error) throw new Error(`Language audit failed: ${error.code}`)
  for (const lead of data) {
    const locale = leadMessageLocale(lead)
    counts[locale || 'unknown'] = (counts[locale || 'unknown'] || 0) + 1
    if (locale && locale !== lead.lead_language) formOverrides++
  }
  if (data.length < 1000) break
}
console.log(JSON.stringify({ counts, authoritativeFormOverrides: formOverrides }))

if (process.argv.includes('--check-translation')) {
  // Synthetic, non-personal content; cache stub means no database writes.
  const cache = { from() { return { select() { return this }, eq() { return this },
    async maybeSingle() { return { data: null } }, async upsert() { return { error: null } },
  } } } as any
  for (const locale of ['es', 'en', 'pt'] as const) {
    const copy = await translateLeadCopy(cache, {
      body: 'Oi {primeiro_nome}! Podemos conversar sobre seguro de vida em 30 minutos? https://example.invalid/agenda',
      subject: 'Sua cotação de seguro de vida',
    }, locale)
    console.log(JSON.stringify({ locale, syntheticTranslation: copy }))
  }
}
