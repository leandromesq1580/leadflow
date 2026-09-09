import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail, type EmailConfig, type EmailDependencies, type Reservation } from './manual-email'

type Environment = Record<string, string | undefined>

export function createEmailDependencies(
  db: SupabaseClient,
  actor: EmailDependencies['actor'],
  env: Environment = process.env,
  transport: typeof fetch = fetch,
): EmailDependencies {
  function config(): EmailConfig {
    const from = (env.RESEND_FROM_EMAIL || '').trim()
    const mailbox = from.match(/^[^<>\r\n]+<([^<>]+)>$/)?.[1] || from
    const postalAddress = (env.MANUAL_EMAIL_POSTAL_ADDRESS || '').trim()
    const origin = new URL(env.NEXT_PUBLIC_APP_URL || 'https://lead4producers.com')
    if (!env.RESEND_API_KEY?.trim() || !normalizeEmail(mailbox) || /@resend\.dev$/i.test(mailbox) ||
        /[\r\n]/.test(from) || !postalAddress || postalAddress.length > 500 ||
        origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
      throw new Error('Manual email configuration unavailable')
    }
    return { from, postalAddress, origin: origin.origin }
  }
  return {
    actor, config,
    async ownedLeads(buyerId, ids) {
      const { data, error } = await db.from('leads').select('id, assigned_to, name, email').eq('assigned_to', buyerId).in('id', ids)
      if (error) throw new Error('Lead lookup failed')
      return data || []
    },
    async preferences(buyerId, emails) {
      const { data, error } = await db.from('manual_email_preferences').select('email, token, suppressed_at').eq('buyer_id', buyerId).in('email', emails)
      if (error) throw new Error('Preference lookup failed')
      return data || []
    },
    async reserve(buyerId, requestId, hash, count) {
      const { data, error } = await db.rpc('reserve_manual_email', { p_buyer_id: buyerId, p_request_id: requestId, p_hash: hash, p_count: count })
      if (error || !data) throw new Error('Reservation failed')
      return data as Reservation
    },
    async preference(buyerId, email) {
      // DO NOTHING on conflict: never clear an opt-out while preparing another email.
      const { error } = await db.from('manual_email_preferences').upsert({ buyer_id: buyerId, email }, { onConflict: 'buyer_id,email', ignoreDuplicates: true })
      if (error) throw new Error('Preference creation failed')
      const result = await db.from('manual_email_preferences').select('email, token, suppressed_at').eq('buyer_id', buyerId).eq('email', email).single()
      if (result.error || !result.data) throw new Error('Preference lookup failed')
      return result.data
    },
    async send(message, key) {
      config()
      // Use the existing Resend provider via REST so each call has an actual abortable timeout.
      // Space individual sends below the provider's default two requests/second; no automatic retries.
      await new Promise(resolve => setTimeout(resolve, 550))
      const response = await transport('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY?.trim()}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(message), signal: AbortSignal.timeout(5000),
      })
      if (response.status >= 500) throw new Error('Provider outcome uncertain')
      if (!response.ok) return { data: null, error: 'provider_refused' }
      const data = await response.json()
      return { data: typeof data?.id === 'string' ? { id: data.id } : null, error: null }
    },
    async finish(batchId, buyerId, results) {
      const { data, error } = await db.from('manual_email_batches').update({ status: 'completed', results })
        .eq('id', batchId).eq('buyer_id', buyerId).eq('status', 'processing').select('id')
      if (error || data?.length !== 1) throw new Error('Result persistence failed')
    },
  }
}
