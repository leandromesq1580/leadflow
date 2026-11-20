import { createHmac } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { availableSlots, SALES_EMAIL, validateBooking } from '@/lib/equipe-booking'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store, max-age=0' }
const reply = (body: object, status = 200) => Response.json(body, { status, headers })

export async function GET() {
  try {
    const db = createAdminClient(), now = new Date()
    const { data: owner, error: ownerError } = await db.from('buyers').select('id').eq('email', SALES_EMAIL).single()
    if (ownerError || !owner) return reply({ code: 'unavailable' }, 503)
    const { data, error } = await db.from('appointments').select('scheduled_at').eq('buyer_id', owner.id)
      .in('status', ['scheduled','confirmed']).gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', new Date(now.getTime() + 31 * 86400000).toISOString())
    if (error) return reply({ code: 'unavailable' }, 503)
    return reply({ slots: availableSlots(now, (data || []).map(a => a.scheduled_at)) })
  } catch { return reply({ code: 'unavailable' }, 503) }
}

export async function POST(req: Request) {
  // Same-origin browser requests only; no cross-origin CORS exposure.
  if (req.headers.get('origin') !== new URL(req.url).origin || req.headers.get('sec-fetch-site') === 'cross-site') return reply({ code: 'invalid' }, 403)
  if (!req.headers.get('content-type')?.startsWith('application/json')) return reply({ code: 'invalid' }, 415)
  let body: ReturnType<typeof validateBooking>
  try {
    // Bound the stream, not just Content-Length (which callers can omit).
    const reader = req.body?.getReader()
    if (!reader) return reply({ code: 'invalid' }, 400)
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 8192) { await reader.cancel(); return reply({ code: 'invalid' }, 413) }
      chunks.push(value)
    }
    body = validateBooking(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  } catch { return reply({ code: 'invalid' }, 400) }
  try {
    // Vercel overwrites x-vercel-forwarded-for. Never trust user-supplied XFF
    // for per-IP throttling. Non-Vercel environments share a conservative bucket.
    const ip = (process.env.VERCEL ? req.headers.get('x-vercel-forwarded-for') : null)?.split(',')[0]?.trim() || 'unknown'
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!secret) return reply({ code: 'unavailable' }, 503)
    const ipHash = createHmac('sha256', secret).update(ip).digest('hex')
    const { data, error } = await createAdminClient().rpc('equipe_book', { p: body, ip_hash: ipHash })
    if (error) {
      if (error.message.includes('slot_taken')) return reply({ code: 'slot_taken' }, 409)
      if (error.message.includes('rate_limited')) return reply({ code: 'rate_limited' }, 429)
      if (error.message === 'invalid') return reply({ code: 'invalid' }, 400)
      return reply({ code: 'unavailable' }, 503)
    }
    if (!data?.ok) return reply({ code: 'unavailable' }, 503)
    // No email/SMS/WhatsApp is sent or promised by this endpoint.
    return reply({ ok: true, slot: data.slot })
  } catch { return reply({ code: 'unavailable' }, 503) }
}
