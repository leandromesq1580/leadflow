import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FIELDS = 'id,buyer_id,is_default'
const WITH_STAGES = `${FIELDS},stages:pipeline_stages(id)`

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

/** Repair a missing default only. Never switch defaults, move cards or enroll leads. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let writeAttempted = false
  const unavailable = () => reply({
    error: writeAttempted ? 'reconcile_required' : 'query_unavailable',
    reconcile_required: writeAttempted,
  }, 503)

  try {
    // Same verified-session / service-role admin lookup as set-plan; never trust a body role.
    const supabase = await createServerSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return reply({ error: 'Unauthorized' }, 401)
    const db = createAdminClient()
    const { data: me, error: adminError } = await db.from('buyers')
      .select('is_admin').eq('auth_user_id', user.id).single()
    if (adminError) return unavailable()
    if (me?.is_admin !== true) return reply({ error: 'Forbidden' }, 403)

    const { id: buyerId } = await params
    let body: unknown
    try { body = await request.json() } catch { return reply({ error: 'invalid_body' }, 400) }
    if (!UUID.test(buyerId) || !body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 1 || !('pipeline_id' in body)
      || typeof body.pipeline_id !== 'string' || !UUID.test(body.pipeline_id)) {
      return reply({ error: 'invalid_body_or_id' }, 400)
    }
    const pipelineId = body.pipeline_id
    // UUID comparisons are case-insensitive in Postgres. Reject noncanonical case rather
    // than silently rewriting caller identifiers or misreporting a successful UPDATE.
    if (buyerId !== buyerId.toLowerCase() || pipelineId !== pipelineId.toLowerCase()) {
      return reply({ error: 'canonical_uuid_required' }, 400)
    }
    const { data: target, error: targetError } = await db.from('pipelines')
      .select(WITH_STAGES).eq('buyer_id', buyerId).eq('id', pipelineId)
      .limit(1, { referencedTable: 'stages' }).maybeSingle()
    if (targetError) return unavailable()
    if (!target) return reply({ error: 'pipeline_not_found_for_buyer' }, 404)
    if (target.id !== pipelineId || target.buyer_id !== buyerId
      || ![true, false, null].includes(target.is_default) || !Array.isArray(target.stages)) return unavailable()
    if (target.stages.length === 0) return reply({ error: 'pipeline_has_no_stages' }, 409)

    // Exact count avoids mistaking a truncated result set for a unique/absent default.
    const { data: defaults, count, error: defaultsError } = await db.from('pipelines')
      .select(FIELDS, { count: 'exact' }).eq('buyer_id', buyerId).eq('is_default', true).limit(2)
    if (defaultsError || !Array.isArray(defaults) || count === null
      || defaults.length !== Math.min(count, 2)
      || defaults.some(row => row.buyer_id !== buyerId || row.is_default !== true)) return unavailable()
    if (count > 1 || (count === 1 && defaults[0].id !== pipelineId)) {
      return reply({ error: 'default_already_exists', reconcile_required: count > 1 }, 409)
    }
    if ((count === 1) !== (target.is_default === true)) return unavailable()

    const changed = count === 0
    if (changed) {
      writeAttempted = true
      // One write, scoped to both IDs and the observed flag (nullable in the schema).
      // No clear-all operation, retry, rollback or process-local locking illusion.
      const { data: updated, count: updatedCount, error: updateError } = await db.from('pipelines')
        .update({ is_default: true }, { count: 'exact' })
        .eq('buyer_id', buyerId).eq('id', pipelineId).is('is_default', target.is_default)
        .select(FIELDS)
      if (updateError || updatedCount !== 1 || !Array.isArray(updated) || updated.length !== 1
        || updated[0].id !== pipelineId || updated[0].buyer_id !== buyerId || updated[0].is_default !== true) return unavailable()
    }

    // One readback snapshot includes target, all defaults (exact count), ownership and stages.
    // Detectable races fail closed. A concurrent writer AFTER this read is not serialized.
    const { data: verified, count: verifiedCount, error: readError } = await db.from('pipelines')
      .select(WITH_STAGES, { count: 'exact' }).eq('buyer_id', buyerId)
      .or(`id.eq.${pipelineId},is_default.eq.true`).limit(2)
      .limit(1, { referencedTable: 'stages' })
    if (readError || verifiedCount !== 1 || !Array.isArray(verified) || verified.length !== 1
      || verified[0].id !== pipelineId || verified[0].buyer_id !== buyerId || verified[0].is_default !== true
      || !Array.isArray(verified[0].stages) || verified[0].stages.length === 0) {
      return reply({ error: 'reconcile_required', reconcile_required: true }, 503)
    }
    const { id, buyer_id, is_default } = verified[0]
    return reply({ success: true, changed, future_leads_only: true, pipeline: { id, buyer_id, is_default }, default_count: verifiedCount })
  } catch {
    // Do not expose service errors, request data or credentials; writes can have committed.
    return unavailable()
  }
}
