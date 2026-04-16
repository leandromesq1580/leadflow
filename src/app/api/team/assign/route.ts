import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTeamMemberNotification } from '@/lib/notifications'

/** POST /api/team/assign — Manually assign a lead to a team member */
export async function POST(request: NextRequest) {
  const { lead_id, member_id } = await request.json()
  if (!lead_id || !member_id) return NextResponse.json({ error: 'Missing lead_id or member_id' }, { status: 400 })

  const db = createAdminClient()

  // Get member
  const { data: member } = await db.from('team_members').select('*').eq('id', member_id).single()
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  // Get lead
  const { data: lead } = await db.from('leads').select('*').eq('id', lead_id).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Assign member
  const { error } = await db.from('leads').update({ assigned_to_member: member_id }).eq('id', lead_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Remove from owner's pipeline (lead goes to member now)
  await db.from('pipeline_leads').delete().eq('lead_id', lead_id)

  // If member has auth_user_id → they're a buyer too → add to THEIR pipeline
  if (member.auth_user_id) {
    const { data: memberBuyer } = await db.from('buyers').select('id').eq('auth_user_id', member.auth_user_id).single()
    if (memberBuyer) {
      const { data: memberPipeline } = await db
        .from('pipelines')
        .select('id, stages:pipeline_stages(id, position)')
        .eq('buyer_id', memberBuyer.id)
        .eq('is_default', true)
        .single()

      if (memberPipeline?.stages?.length) {
        const firstStage = (memberPipeline.stages as any[]).sort((a: any, b: any) => a.position - b.position)[0]
        await db.from('pipeline_leads').upsert({
          lead_id, pipeline_id: memberPipeline.id, stage_id: firstStage.id,
          position: 0, moved_at: new Date().toISOString(),
        }, { onConflict: 'lead_id,pipeline_id' })
      }
    }
  }

  // Notify member
  await sendTeamMemberNotification(member, lead)

  return NextResponse.json({ success: true })
}
