import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeHours } from '@/lib/availability'
import { callerBuyer, canActAs } from '@/lib/api-auth'

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

const stateCodes = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '))
const days = new Set(['weekday', 'saturday', 'sunday', 'holiday'])
const periods = new Set(['morning', 'afternoon', 'evening'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  try {
    const db = createAdminClient()
    const caller = await callerBuyer(db)
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid settings' }, { status: 400 })
    }
    const { buyer_id, auth_user_id, states, availability } = body
    let resolvedBuyerId = buyer_id
    if (!resolvedBuyerId && auth_user_id) {
      if (!caller.isAdmin && auth_user_id !== caller.authUserId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { data: buyer, error } = await db.from('buyers').select('id').eq('auth_user_id', auth_user_id).single()
      if (error || !buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
      resolvedBuyerId = buyer.id
    }
    if (typeof resolvedBuyerId !== 'string' || !uuid.test(resolvedBuyerId)) {
      return NextResponse.json({ error: 'Invalid buyer_id' }, { status: 400 })
    }
    if (!canActAs(caller, resolvedBuyerId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Omitted collections mean preserve; only an explicit array means replace.
    // Validate the whole payload BEFORE any mutation (null is not an empty list).
    if (states !== undefined && (!Array.isArray(states) || states.some(s => typeof s !== 'string' || !stateCodes.has(s)))) {
      return NextResponse.json({ error: 'Invalid states' }, { status: 400 })
    }
    if (availability !== undefined && (!Array.isArray(availability) || availability.some(a =>
      !a || typeof a !== 'object' || !days.has(a.day_type) || !periods.has(a.period)
      || (a.hours != null && !Array.isArray(a.hours))))) {
      return NextResponse.json({ error: 'Invalid availability' }, { status: 400 })
    }
    const profile: Record<string, unknown> = {}
    for (const key of ['name', 'phone', 'whatsapp', 'notification_phone_2', 'cal_link']) {
      if (body[key] === undefined) continue
      if (body[key] !== null && typeof body[key] !== 'string') return NextResponse.json({ error: 'Invalid profile' }, { status: 400 })
      profile[key] = key === 'notification_phone_2' ? (body[key] || '').trim() || null : body[key]
    }
    for (const key of ['notification_email', 'notification_sms', 'is_agency']) {
      if (body[key] === undefined) continue
      if (typeof body[key] !== 'boolean') return NextResponse.json({ error: 'Invalid profile' }, { status: 400 })
      profile[key] = body[key]
    }
    if (body.team_distribution_mode !== undefined) {
      if (!['manual', 'auto_roundrobin'].includes(body.team_distribution_mode)) return NextResponse.json({ error: 'Invalid team mode' }, { status: 400 })
      profile.team_distribution_mode = body.team_distribution_mode
    }
    type AvailabilityInput = { day_type: string; period: string; hours?: unknown }
    const rows = availability === undefined ? null : (availability as AvailabilityInput[]).map(a => {
      const hours = sanitizeHours(a.period, a.hours)
      return { day_type: a.day_type, period: a.period, hours: hours.length ? hours : null }
    })
    if (rows && new Set(rows.map(a => `${a.day_type}:${a.period}`)).size !== rows.length) {
      return NextResponse.json({ error: 'Duplicate availability' }, { status: 400 })
    }
    const { error } = await db.rpc('save_buyer_settings', {
      p_buyer_id: resolvedBuyerId,
      p_profile: profile,
      p_states: states === undefined ? null : [...new Set(states as string[])],
      p_availability: rows,
    })
    if (error) {
      // Never log the request/profile or raw database error (may contain PII).
      console.error('[Settings] Save failed', { code: error.code })
      return NextResponse.json({ error: 'Failed to save; previous settings preserved' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch {
    console.error('[Settings] Save unavailable')
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
