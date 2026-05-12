import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/debug-sequences?secret=X[&buyer_email=Y]
 * Snapshot completo das sequences: enabled, trigger_stage, steps, enrollments,
 * leads no stage trigger, due-to-run.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const buyerEmail = url.searchParams.get('buyer_email')
  let buyerFilter: string | null = null
  if (buyerEmail) {
    const { data: b } = await db.from('buyers').select('id').ilike('email', buyerEmail).maybeSingle()
    if (b?.id) buyerFilter = b.id
  }

  let q = db.from('sequences').select('*').eq('enabled', true)
  if (buyerFilter) q = q.eq('buyer_id', buyerFilter)
  const { data: seqs } = await q

  if (!seqs || seqs.length === 0) return NextResponse.json({ sequences: [], note: 'no enabled sequences' })

  const now = new Date().toISOString()
  const result: any[] = []
  for (const s of seqs) {
    // Stage info
    let stage: any = null
    let pipeline: any = null
    if (s.trigger_stage_id) {
      const { data: st } = await db.from('pipeline_stages').select('id, name, pipeline_id').eq('id', s.trigger_stage_id).maybeSingle()
      stage = st
      if (st?.pipeline_id) {
        const { data: p } = await db.from('pipelines').select('id, name, buyer_id').eq('id', st.pipeline_id).maybeSingle()
        pipeline = p
      }
    }

    // Buyer info
    const { data: buyer } = await db.from('buyers').select('id, name, email').eq('id', s.buyer_id).maybeSingle()

    // Steps
    const { data: steps } = await db.from('sequence_steps').select('step_order, delay_hours, step_type, template_id, custom_body').eq('sequence_id', s.id).order('step_order')

    // Leads no stage trigger atualmente
    let leadsInStage = 0
    let leadsInStageSample: any[] = []
    if (s.trigger_stage_id) {
      // pega pipeline_id correto (pode ser diferente entre buyers)
      const { data: pls } = await db
        .from('pipeline_leads')
        .select('lead_id')
        .eq('stage_id', s.trigger_stage_id)
        .limit(200)
      leadsInStage = (pls || []).length
      leadsInStageSample = (pls || []).slice(0, 3)
    }

    // Enrollments dessa sequence
    const { count: totalEnrollments } = await db
      .from('sequence_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('sequence_id', s.id)

    const { count: activeEnrollments } = await db
      .from('sequence_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('sequence_id', s.id)
      .eq('status', 'active')

    const { count: dueNow } = await db
      .from('sequence_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('sequence_id', s.id)
      .eq('status', 'active')
      .lte('next_run_at', now)

    const { data: dueSample } = await db
      .from('sequence_enrollments')
      .select('id, lead_id, current_step, next_run_at, status, enrolled_at')
      .eq('sequence_id', s.id)
      .eq('status', 'active')
      .order('next_run_at')
      .limit(5)

    result.push({
      sequence: { id: s.id, name: s.name, enabled: s.enabled, trigger_stage_id: s.trigger_stage_id },
      buyer,
      pipeline,
      stage,
      steps: steps?.length || 0,
      steps_detail: steps,
      leads_in_trigger_stage: leadsInStage,
      leads_in_stage_sample: leadsInStageSample,
      enrollments: {
        total: totalEnrollments ?? 0,
        active: activeEnrollments ?? 0,
        due_now: dueNow ?? 0,
        upcoming_sample: dueSample,
      },
    })
  }

  return NextResponse.json({ now, sequences: result })
}
