import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/move-leads-to-stage?secret=X
 * Body: {
 *   buyer_id: string,           // dono do pipeline destino
 *   stage_name?: string,        // default: 'Novo Lead'
 *   pipeline_name?: string,     // default: pipeline.is_default = true
 *   lead_ids?: string[],
 *   phones?: string[],          // alternativa: matches por phone exato ou last10
 * }
 *
 * Insere/atualiza pipeline_leads pra mover os leads pro stage indicado
 * dentro do pipeline default do buyer (ou pipeline_name).
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const buyerId = body.buyer_id
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const stageName = body.stage_name || 'Novo Lead'
  const pipelineName = body.pipeline_name || null

  const db = createAdminClient()

  // Resolve pipeline
  let pipelineQuery = db.from('pipelines')
    .select('id, name, stages:pipeline_stages(id, name, position)')
    .eq('buyer_id', buyerId)
  if (pipelineName) pipelineQuery = pipelineQuery.eq('name', pipelineName)
  else pipelineQuery = pipelineQuery.eq('is_default', true)

  const { data: pipe } = await pipelineQuery.maybeSingle()
  if (!pipe) return NextResponse.json({ error: 'Pipeline not found for buyer' }, { status: 404 })

  const stages = (pipe as any).stages || []
  const stage = stages.find((s: any) => s.name === stageName)
  if (!stage) return NextResponse.json({
    error: `Stage "${stageName}" not found in pipeline "${pipe.name}"`,
    available_stages: stages.map((s: any) => s.name),
  }, { status: 404 })

  // Resolve lead_ids
  let leadIds: string[] = []
  if (Array.isArray(body.lead_ids) && body.lead_ids.length > 0) {
    leadIds = body.lead_ids
  } else if (Array.isArray(body.phones) && body.phones.length > 0) {
    const phones = body.phones.map((p: string) => String(p).replace(/\D/g, ''))
    const ors = phones.map((p: string) => `phone.ilike.%${p.slice(-10)}`).join(',')
    const { data: leads } = await db.from('leads').select('id, phone, name').or(ors).limit(100)
    leadIds = (leads || []).map(l => l.id)
  }

  if (leadIds.length === 0) return NextResponse.json({ error: 'No leads to move' }, { status: 400 })

  // Upsert
  const entries = leadIds.map((leadId: string, i: number) => ({
    lead_id: leadId,
    pipeline_id: pipe.id,
    stage_id: stage.id,
    position: i,
    moved_at: new Date().toISOString(),
  }))

  const { data, error } = await db
    .from('pipeline_leads')
    .upsert(entries, { onConflict: 'lead_id,pipeline_id' })
    .select('id, lead_id, stage_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    pipeline: { id: pipe.id, name: pipe.name },
    stage: { id: stage.id, name: stage.name },
    moved: data?.length ?? 0,
    entries: data,
  })
}
