import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/debug-automations?secret=X
 * Retorna estado real das automacoes pra debugar por que nao disparam.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const { data: autos } = await db.from('automations').select('*').eq('enabled', true)

  const result: any[] = []
  for (const auto of autos || []) {
    const info: any = {
      id: auto.id,
      buyer_id: auto.buyer_id,
      name: auto.name,
      trigger_type: auto.trigger_type,
      trigger_config: auto.trigger_config,
      action_type: auto.action_type,
      action_config: auto.action_config,
    }

    if (auto.trigger_type === 'stage_entered' || auto.trigger_type === 'stage_stale') {
      const stageId = auto.trigger_config?.stage_id
      info.stage_id = stageId

      // Pipelines do buyer
      const { data: pipes } = await db.from('pipelines').select('id, name').eq('buyer_id', auto.buyer_id)
      info.pipelines = pipes || []

      // Stage existe?
      const { data: stage } = await db.from('pipeline_stages').select('id, name, pipeline_id').eq('id', stageId).maybeSingle()
      info.stage = stage

      // Leads no stage
      const pipelineIds = (pipes || []).map(p => p.id)
      if (pipelineIds.length > 0 && stageId) {
        const { data: leads } = await db
          .from('pipeline_leads')
          .select('id, lead_id, pipeline_id, stage_id, moved_at')
          .eq('stage_id', stageId)
          .in('pipeline_id', pipelineIds)
        info.leads_in_stage = leads?.length || 0
        info.sample_leads = (leads || []).slice(0, 3)

        // Quantos ja tem automation_run + status
        if (leads && leads.length > 0) {
          const leadIds = leads.map(l => l.lead_id)
          const { data: runs } = await db
            .from('automation_runs')
            .select('lead_id, status, error, created_at')
            .eq('automation_id', auto.id)
            .in('lead_id', leadIds)
            .order('created_at', { ascending: false })
          info.already_ran = runs?.length || 0
          info.pending = (leads.length - (runs?.length || 0))
          info.runs_breakdown = {
            success: (runs || []).filter(r => r.status === 'success').length,
            failed: (runs || []).filter(r => r.status === 'failed').length,
          }
          info.runs_sample = (runs || []).slice(0, 3)
        }
      }
    }

    result.push(info)
  }

  return NextResponse.json({ automations_enabled: result.length, details: result })
}
