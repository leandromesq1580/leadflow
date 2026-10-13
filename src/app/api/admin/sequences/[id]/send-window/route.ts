import { NextRequest, NextResponse } from 'next/server'
import { isDeepStrictEqual } from 'node:util'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateAIConfig } from '@/lib/ai-sequence-config'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const FIELDS = 'id,buyer_id,mode,enabled,updated_at,ai_config'
const KEYS = ['buyer_id', 'expected_start', 'expected_end', 'start', 'end']
function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

/** Window only: no enrollment rescheduling, activation, generation or transport. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let writeAttempted = false
  const unavailable = () => reply({
    error: writeAttempted ? 'reconcile_required' : 'query_unavailable',
    reconcile_required: writeAttempted,
  }, 503)
  try {
    const session = await createServerSupabase()
    const { data: { user }, error: authError } = await session.auth.getUser()
    if (authError || !user) return reply({ error: 'Unauthorized' }, 401)
    const db = createAdminClient()
    const { data: me, error: adminError } = await db.from('buyers')
      .select('is_admin').eq('auth_user_id', user.id).single()
    if (adminError) return unavailable()
    if (me?.is_admin !== true) return reply({ error: 'Forbidden' }, 403)

    const { id } = await params
    let body: unknown
    try { body = await request.json() } catch { return reply({ error: 'invalid_body' }, 400) }
    if (!UUID.test(id) || !body || typeof body !== 'object' || Array.isArray(body)) {
      return reply({ error: 'invalid_body_or_id' }, 400)
    }
    const input = body as Record<string, unknown>
    if (Object.keys(input).length !== KEYS.length || KEYS.some(key => typeof input[key] !== 'string')
      || !UUID.test(input.buyer_id as string)
      || ['expected_start', 'expected_end', 'start', 'end'].some(key => !CLOCK.test(input[key] as string))
      || (input.start as string) >= (input.end as string)
      || (input.expected_start as string) >= (input.expected_end as string)) {
      return reply({ error: 'invalid_body_or_id' }, 400)
    }
    const buyerId = input.buyer_id as string
    const { data: target, error: readError } = await db.from('sequences')
      .select(FIELDS).eq('id', id).eq('buyer_id', buyerId).maybeSingle()
    if (readError) return unavailable()
    if (!target) return reply({ error: 'sequence_not_found_for_buyer' }, 404)
    if (target.id !== id || target.buyer_id !== buyerId || typeof target.enabled !== 'boolean'
      || typeof target.updated_at !== 'string' || !Number.isFinite(Date.parse(target.updated_at))) return unavailable()
    if (target.mode !== 'ai_until_reply') return reply({ error: 'ai_sequence_required' }, 409)
    // Validate but never persist normalized config: keep instructions, unknown fields,
    // model defaults, cadence, timezone and days byte-for-byte as JSON values.
    let config
    try { config = validateAIConfig(target.ai_config) } catch {
      return reply({ error: 'invalid_existing_config' }, 409)
    }
    const expectedConfig = { ...target.ai_config, start: input.start, end: input.end }
    try { validateAIConfig(expectedConfig) } catch { return reply({ error: 'invalid_window' }, 400) }
    const changed = config.start !== input.start || config.end !== input.end
    if (changed && (config.start !== input.expected_start || config.end !== input.expected_end)) {
      return reply({ error: 'window_conflict' }, 409)
    }
    if (changed) {
      // Missing/disabled migration must fail before the UPDATE can fire old triggers.
      const { data: ready, error: readinessError } = await db.rpc('admin_sequence_window_ready')
      if (readinessError || ready !== true) return unavailable()
      writeAttempted = true;
      // A single conditional UPDATE protects against any edit since our snapshot.
      // JSONB equality ignores key order. No retry of an ambiguous write.
      const { data: updated, count, error: updateError } = await db.from('sequences')
        .update({ ai_config: expectedConfig, updated_at: new Date().toISOString() }, { count: 'exact' })
        .eq('id', id).eq('buyer_id', buyerId).eq('mode', target.mode).eq('enabled', target.enabled)
        .eq('updated_at', target.updated_at).eq('ai_config', JSON.stringify(target.ai_config)).select(FIELDS)
      if (updateError) return unavailable()
      if (count === 0 && Array.isArray(updated) && updated.length === 0) return reply({ error: 'window_conflict' }, 409)
      if (count !== 1 || !Array.isArray(updated) || updated.length !== 1
        || updated[0].id !== id || updated[0].buyer_id !== buyerId || updated[0].mode !== target.mode
        || updated[0].enabled !== target.enabled || !isDeepStrictEqual(updated[0].ai_config, expectedConfig)) return unavailable()
    }
    // Full readback catches detectable edits of non-window fields as well.
    // A later independent writer is not serialized after this readback.
    const { data: verified, error: verifyError } = await db.from('sequences')
      .select(FIELDS).eq('id', id).eq('buyer_id', buyerId).maybeSingle()
    if (verifyError || !verified || verified.id !== id || verified.buyer_id !== buyerId
      || verified.mode !== target.mode || verified.enabled !== target.enabled
      || !isDeepStrictEqual(verified.ai_config, expectedConfig)) return unavailable()
    if (changed) console.info('[admin-sequence-window]', { actor_id: user.id, buyer_id: buyerId, sequence_id: id,
      before: { start: config.start, end: config.end }, after: { start: input.start, end: input.end } })
    return reply({ success: true, changed, sequence_id: id, buyer_id: buyerId,
      window: { start: input.start, end: input.end, repeat_minutes: config.repeat_minutes, timezone: config.timezone, days: config.days },
      enrollments_changed: false, messages_sent: false })
  } catch {
    return unavailable()
  }
}
