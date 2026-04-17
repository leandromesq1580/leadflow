import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const buyerId = url.searchParams.get('buyer_id')
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()
  const { data: automations } = await db
    .from('automations')
    .select('*')
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ automations: automations || [] })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { buyer_id, name, trigger_type, trigger_config, action_type, action_config } = body

    if (!buyer_id || !name || !trigger_type || !action_type) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const db = createAdminClient()
    const { data, error } = await db.from('automations').insert({
      buyer_id,
      name,
      trigger_type,
      trigger_config: trigger_config || {},
      action_type,
      action_config: action_config || {},
      enabled: true,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ automation: data })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
