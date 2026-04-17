import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const authId = url.searchParams.get('auth_user_id')
  const buyerId = url.searchParams.get('buyer_id')
  if (!authId && !buyerId) return NextResponse.json({ error: 'Missing auth_user_id or buyer_id' }, { status: 400 })

  const db = createAdminClient()
  const query = db.from('buyers').select('*')
  const { data: buyer } = authId
    ? await query.eq('auth_user_id', authId).single()
    : await query.eq('id', buyerId!).single()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  return NextResponse.json(buyer)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { buyer_id, auth_user_id, name, phone, whatsapp, cal_link, notification_email, notification_sms, states, availability, is_agency, team_distribution_mode } = body

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
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (phone !== undefined) updateData.phone = phone
    if (whatsapp !== undefined) updateData.whatsapp = whatsapp
    if (cal_link !== undefined) updateData.cal_link = cal_link
    if (notification_email !== undefined) updateData.notification_email = notification_email
    if (notification_sms !== undefined) updateData.notification_sms = notification_sms
    if (is_agency !== undefined) updateData.is_agency = is_agency
    if (team_distribution_mode !== undefined) updateData.team_distribution_mode = team_distribution_mode

    if (Object.keys(updateData).length > 0) {
      await db.from('buyers').update(updateData).eq('id', resolvedBuyerId)
    }

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
