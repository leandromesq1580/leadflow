import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAppointmentNotificationEmail } from '@/lib/notifications'

export async function POST(request: NextRequest) {
  try {
    const { lead_id, buyer_id, scheduled_at, notes } = await request.json()

    if (!lead_id || !buyer_id || !scheduled_at) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const db = createAdminClient()

    // Create appointment
    await db.from('appointments').insert({
      lead_id,
      buyer_id,
      scheduled_at,
      qualification_notes: notes || '',
      status: 'scheduled',
    })

    // Update lead status
    await db.from('leads').update({
      status: 'appointment_set',
      assigned_to: buyer_id,
      assigned_at: new Date().toISOString(),
    }).eq('id', lead_id)

    // Decrement appointment credit
    const { data: credit } = await db
      .from('credits')
      .select('id, total_used')
      .eq('buyer_id', buyer_id)
      .eq('type', 'appointment')
      .gt('total_purchased', 0)
      .order('purchased_at', { ascending: true })
      .limit(1)
      .single()

    if (credit) {
      await db.from('credits').update({ total_used: credit.total_used + 1 }).eq('id', credit.id)
    }

    // Notify buyer
    const { data: buyer } = await db.from('buyers').select('name, email, phone').eq('id', buyer_id).single()
    const { data: lead } = await db.from('leads').select('name, phone, city, state, interest').eq('id', lead_id).single()

    if (buyer && lead) {
      await sendAppointmentNotificationEmail(buyer, lead, scheduled_at, notes || '')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Appointments] Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
