import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTeamMemberNotification } from '@/lib/notifications'
import { migrateWhatsAppOwnership } from '@/lib/lead-ownership'
import { placeLeadInMemberPipeline } from '@/lib/place-member-lead'

/** POST /api/team/assign — Manually assign a lead to a team member */
export async function POST(request: NextRequest) {
  const { lead_id, member_id } = await request.json()
  if (!lead_id || !member_id) return NextResponse.json({ error: 'Missing lead_id or member_id' }, { status: 400 })

  const db = createAdminClient()

  // Get member
  let { data: member } = await db.from('team_members').select('*').eq('id', member_id).single()
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  // Get lead
  const { data: lead } = await db.from('leads').select('*').eq('id', lead_id).single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Assign member
  const { error } = await db.from('leads').update({ assigned_to_member: member_id }).eq('id', lead_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Coloca o lead no pipeline do MEMBRO (só remove o card antigo quando cria o novo —
  // assim o lead delegado nunca fica sem card). Se o membro não tem pipeline próprio,
  // mantém o card atual em vez de sumir. Migra a thread de WhatsApp pro novo dono.
  const memberBuyerId = await placeLeadInMemberPipeline(db, lead_id, member)
  if (memberBuyerId) {
    const migrated = await migrateWhatsAppOwnership(db, lead_id, memberBuyerId)
    if (migrated > 0) console.log(`[Assign] Migrated ${migrated} WA messages for lead ${lead_id} -> buyer ${memberBuyerId}`)
  }

  // Notify member
  await sendTeamMemberNotification(member, lead)

  return NextResponse.json({ success: true })
}
