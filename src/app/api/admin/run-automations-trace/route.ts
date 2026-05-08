import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/run-automations-trace?secret=X&automation_id=Y
 *
 * Roda a logica de findTargets + idempotency check + (opcionalmente) execute
 * mas retorna passo a passo o que aconteceu, sem silenciar exceptions.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const automationId = url.searchParams.get('automation_id')
  if (!automationId) return NextResponse.json({ error: 'Missing automation_id' }, { status: 400 })

  const db = createAdminClient()
  const trace: any[] = []

  try {
    const { data: auto, error: aerr } = await db.from('automations').select('*').eq('id', automationId).single()
    trace.push({ step: 'load_automation', ok: !aerr, auto: auto ? { id: auto.id, enabled: auto.enabled, trigger_type: auto.trigger_type, trigger_config: auto.trigger_config } : null, err: aerr?.message })
    if (!auto) return NextResponse.json({ trace, error: 'automation not found' })

    // pipelineIdsOfBuyer
    const { data: pipes, error: perr } = await db.from('pipelines').select('id').eq('buyer_id', auto.buyer_id)
    const pipelineIds = (pipes || []).map((p: any) => p.id)
    trace.push({ step: 'pipelines_of_buyer', count: pipelineIds.length, ids: pipelineIds, err: perr?.message })

    if (auto.trigger_type === 'stage_entered') {
      const stageId = auto.trigger_config?.stage_id
      trace.push({ step: 'stage_id', stageId })

      const { data: pls, error: lerr } = await db
        .from('pipeline_leads')
        .select('id, lead_id, stage_id, pipeline_id')
        .eq('stage_id', stageId)
        .in('pipeline_id', pipelineIds)
      trace.push({ step: 'pipeline_leads_found', count: pls?.length || 0, sample: (pls || []).slice(0, 2), err: lerr?.message })

      // Pra cada um, checa idempotency
      for (const pl of pls || []) {
        const { data: existing } = await db
          .from('automation_runs')
          .select('id')
          .eq('automation_id', auto.id)
          .eq('lead_id', pl.lead_id)
          .is('meeting_id', null)
          .maybeSingle()
        trace.push({ step: 'idempotency_check', lead_id: pl.lead_id, existing: !!existing })
      }
    }

    return NextResponse.json({ trace })
  } catch (err: any) {
    return NextResponse.json({ trace, exception: err?.message, stack: err?.stack?.split('\n').slice(0, 3) }, { status: 500 })
  }
}
