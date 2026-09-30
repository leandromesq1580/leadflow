import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
  try {
    const db = createAdminClient()
    const caller = await callerBuyer(db)
    if (!caller) return NextResponse.json({error:'Unauthorized'}, {status:401,headers})
    const requested = new URL(request.url).searchParams.get('buyer_id')
    if (requested && requested !== caller.id) return NextResponse.json({error:'Owner access required'}, {status:403,headers})
    const { data: automations, error } = await db.from('automations').select('*')
      .eq('buyer_id',caller.id).order('created_at', {ascending:false})
    if (error) throw error
    return NextResponse.json({buyer_id:caller.id,automations:automations || []},{headers})
  } catch { return NextResponse.json({error:'Automations unavailable'}, {status:503,headers}) }
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
