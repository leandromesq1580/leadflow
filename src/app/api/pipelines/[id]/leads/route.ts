import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** GET /api/pipelines/[id]/leads — all leads grouped by stage + latest follow-up */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: pipelineId } = await params
  const db = createAdminClient()

  const { data, error } = await db
    .from('pipeline_leads')
    .select('id, stage_id, position, moved_at, lead:leads(id, name, email, phone, city, state, interest, type, status, created_at, contract_closed, policy_value, assigned_to_member)')
    .eq('pipeline_id', pipelineId)
    // Ordem por IDADE DO LEAD — mais recente (lead.created_at) no topo.
    // PostgREST ordenacao no embed:
    .order('created_at', { referencedTable: 'leads', ascending: false, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Anexa o último follow-up por lead (scheduled_at DESC, fallback pra created_at)
  const leadIds = (data || []).map((pl: any) => pl.lead?.id).filter(Boolean)
  let latestByLead: Record<string, { type: string; scheduled_at: string | null; created_at: string }> = {}
  if (leadIds.length > 0) {
    const { data: fus } = await db
      .from('follow_ups')
      .select('lead_id, type, scheduled_at, created_at')
      .in('lead_id', leadIds)
      .order('scheduled_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    for (const fu of fus || []) {
      if (!latestByLead[fu.lead_id]) latestByLead[fu.lead_id] = fu as any
    }
  }

  const enriched = (data || []).map((pl: any) => ({
    ...pl,
    last_follow_up: pl.lead?.id ? latestByLead[pl.lead.id] || null : null,
  }))

  return NextResponse.json({ leads: enriched })
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
