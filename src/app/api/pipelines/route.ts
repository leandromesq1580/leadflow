import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_STAGES = [
  { name: 'Novo Lead', color: '#3b82f6', position: 0 },
  { name: 'Atendido', color: '#f59e0b', position: 1 },
  { name: 'Qualificado', color: '#10b981', position: 2 },
  { name: 'Envio Proposta', color: '#8b5cf6', position: 3 },
  { name: 'Negociação', color: '#f97316', position: 4 },
  { name: 'Fechado/Ganho', color: '#059669', position: 5 },
  { name: 'Perdido', color: '#ef4444', position: 6 },
]

/** GET /api/pipelines — list buyer's pipelines with stages */
export async function GET(request: NextRequest) {
  const buyerId = new URL(request.url).searchParams.get('buyer_id')
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()
  const { data } = await db
    .from('pipelines')
    .select('*, stages:pipeline_stages(id, name, color, position)')
    .eq('buyer_id', buyerId)
    .order('created_at')

  // Sort stages by position within each pipeline
  const pipelines = (data || []).map(p => ({
    ...p,
    stages: (p.stages || []).sort((a: any, b: any) => a.position - b.position),
  }))

  return NextResponse.json({ pipelines })
}

/** POST /api/pipelines — create pipeline with default stages */
export async function POST(request: NextRequest) {
  const { buyer_id, name } = await request.json()
  if (!buyer_id || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = createAdminClient()

  // Check if first pipeline (make it default)
  const { count } = await db.from('pipelines').select('id', { count: 'exact', head: true }).eq('buyer_id', buyer_id)
  const isDefault = (count || 0) === 0

  const { data: pipeline, error } = await db
    .from('pipelines')
    .insert({ buyer_id, name, is_default: isDefault })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Create default stages
  const stages = DEFAULT_STAGES.map(s => ({ ...s, pipeline_id: pipeline.id }))
  await db.from('pipeline_stages').insert(stages)

  // Auto-populate: add all existing leads to first stage
  const { data: firstStage } = await db
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipeline.id)
    .order('position')
    .limit(1)
    .single()

  if (firstStage) {
    const { data: leads } = await db
      .from('leads')
      .select('id')
      .eq('assigned_to', buyer_id)

    if (leads && leads.length > 0) {
      const entries = leads.map((l, i) => ({
        lead_id: l.id,
        pipeline_id: pipeline.id,
        stage_id: firstStage.id,
        position: i,
      }))
      await db.from('pipeline_leads').insert(entries)
    }
  }

  return NextResponse.json({ pipeline })
}
