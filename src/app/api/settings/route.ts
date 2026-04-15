import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { buyer_id, name, phone, whatsapp, cal_link, notification_email, notification_sms, states, availability } = body

    if (!buyer_id) {
      return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })
    }

    const db = createAdminClient()

    // Update buyer profile
    await db.from('buyers').update({
      name, phone, whatsapp, cal_link,
      notification_email, notification_sms,
    }).eq('id', buyer_id)

    // Update states: delete all, then insert new
    await db.from('buyer_states').delete().eq('buyer_id', buyer_id)
    if (states && states.length > 0) {
      await db.from('buyer_states').insert(
        states.map((state_code: string) => ({ buyer_id, state_code }))
      )
    }

    // Update availability: delete all, then insert new
    await db.from('buyer_availability').delete().eq('buyer_id', buyer_id)
    if (availability && availability.length > 0) {
      await db.from('buyer_availability').insert(
        availability.map((a: { day_type: string; period: string }) => ({
          buyer_id,
          day_type: a.day_type,
          period: a.period,
        }))
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Settings] Error:', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
