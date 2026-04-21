import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/leads/[id]/unarchive
 * Reactivate an archived lead. Clears the archived flags and reinserts the lead
 * into the appropriate pipeline (the assigned member's pipeline if it has one,
 * otherwise the owner's default pipeline) at the first stage.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()

  // Load the lead (need assigned_to + assigned_to_member to decide pipeline)
  const { data: lead, error: leadErr } = await db
    .from('leads')
    .select('id, archived, assigned_to, assigned_to_member')
    .eq('id', id)
    .single()
  if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  if (!lead.archived) return NextResponse.json({ ok: true, already: true })

  // Figure out the target buyer whose pipeline should receive the lead back.
  // 1) If assigned to a team member that has a linked auth user → that member's buyer
  // 2) Else fall back to the lead's original owner (assigned_to)
  let targetBuyerId: string | null = lead.assigned_to as string | null
  if (lead.assigned_to_member) {
    const { data: member } = await db
      .from('team_members')
      .select('auth_user_id')
      .eq('id', lead.assigned_to_member)
      .maybeSingle()
    if (member?.auth_user_id) {
      const { data: memberBuyer } = await db
        .from('buyers')
        .select('id')
        .eq('auth_user_id', member.auth_user_id)
        .maybeSingle()
      if (memberBuyer) targetBuyerId = memberBuyer.id
    }
  }

  // Find the target buyer's default pipeline + first stage
  let pipelineInsert: { pipeline_id: string; stage_id: string } | null = null
  if (targetBuyerId) {
    const { data: pipeline } = await db
      .from('pipelines')
      .select('id, stages:pipeline_stages(id, position)')
      .eq('buyer_id', targetBuyerId)
      .eq('is_default', true)
      .maybeSingle()
    const stages = (pipeline?.stages as { id: string; position: number }[] | null) || []
    if (pipeline?.id && stages.length > 0) {
      const firstStage = [...stages].sort((a, b) => a.position - b.position)[0]
      pipelineInsert = { pipeline_id: pipeline.id, stage_id: firstStage.id }
    }
  }

  // Clear archived flags
  const { error: updateErr } = await db
    .from('leads')
    .update({ archived: false, archived_at: null, archived_by: null })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Put the lead back on the pipeline (if we found one)
  if (pipelineInsert) {
    const { error: insertErr } = await db.from('pipeline_leads').upsert(
      {
        lead_id: id,
        pipeline_id: pipelineInsert.pipeline_id,
        stage_id: pipelineInsert.stage_id,
        position: 0,
        moved_at: new Date().toISOString(),
      },
      { onConflict: 'lead_id,pipeline_id' },
    )
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, reinserted: !!pipelineInsert })
}
