import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const buyerId = url.searchParams.get('buyer_id')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()
  let query = db.from('calendar_items').select('*').eq('buyer_id', buyerId)
  if (from) query = query.gte('start_at', from)
  if (to) query = query.lte('start_at', to)
  const { data, error } = await query.order('start_at').limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id').eq('auth_user_id', user.id).single()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  const body = await request.json()
  const { kind, title, description, start_at, end_at, all_day, location, attendees, color, lead_id } = body

  if (!kind || !title?.trim() || !start_at) {
    return NextResponse.json({ error: 'Missing kind, title or start_at' }, { status: 400 })
  }
  if (!['event', 'task'].includes(kind)) {
    return NextResponse.json({ error: 'kind must be event or task' }, { status: 400 })
  }

  const defaultColor = kind === 'event' ? '#10b981' : '#0ea5e9'

  const { data, error } = await db.from('calendar_items').insert({
    buyer_id: buyer.id,
    kind,
    title: title.trim(),
    description: description || null,
    start_at,
    end_at: end_at || null,
    all_day: !!all_day,
    location: location || null,
    attendees: attendees || [],
    color: color || defaultColor,
    lead_id: lead_id || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
