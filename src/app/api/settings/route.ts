import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { buyer_id, auth_user_id, name, phone, whatsapp, cal_link, notification_email, notification_sms, states, availability } = body

    const db = createAdminClient()

    // Resolve buyer_id from auth_user_id if needed
    let resolvedBuyerId = buyer_id
    if (!resolvedBuyerId && auth_user_id) {
      const { data: buyer } = await db.from('buyers').select('id').eq('auth_user_id', auth_user_id).single()
      resolvedBuyerId = buyer?.id
    }

    if (!resolvedBuyerId) {
      return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })
    }

    // Update buyer profile
    await db.from('buyers').update({
      name, phone, whatsapp, cal_link,
      notification_email, notification_sms,
    }).eq('id', resolvedBuyerId)

    // Update states: delete all, then insert new
    await db.from('buyer_states').delete().eq('buyer_id', resolvedBuyerId)
    if (states && states.length > 0) {
      await db.from('buyer_states').insert(
        states.map((state_code: string) => ({ buyer_id, state_code }))
      )
    }

    // Update availability: delete all, then insert new
    await db.from('buyer_availability').delete().eq('buyer_id', resolvedBuyerId)
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
