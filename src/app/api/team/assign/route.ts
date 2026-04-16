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

  // Assign
  const { error } = await db.from('leads').update({ assigned_to_member: member_id }).eq('id', lead_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify member
  await sendTeamMemberNotification(member, lead)

  return NextResponse.json({ success: true })
}
