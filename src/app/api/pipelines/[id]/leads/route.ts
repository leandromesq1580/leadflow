import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** GET /api/pipelines/[id]/leads — all leads grouped by stage */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: pipelineId } = await params
  const db = createAdminClient()

  const { data, error } = await db
    .from('pipeline_leads')
    .select('id, stage_id, position, moved_at, lead:leads(id, name, email, phone, city, state, interest, type, status, created_at, contract_closed, policy_value)')
    .eq('pipeline_id', pipelineId)
    .order('position')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data || [] })
}

/** POST /api/pipelines/[id]/leads — add lead to pipeline */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: pipelineId } = await params
  const { lead_id, stage_id } = await request.json()
  const db = createAdminClient()

  const { data, error } = await db
    .from('pipeline_leads')
    .upsert({ lead_id, pipeline_id: pipelineId, stage_id, position: 0, moved_at: new Date().toISOString() }, { onConflict: 'lead_id,pipeline_id' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}
