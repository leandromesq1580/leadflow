import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Owner is taken exclusively from the session, never from the request body. */
export async function POST(request: NextRequest) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || !uuid.test(body.lead_id || '') || (body.member_id != null && !uuid.test(body.member_id))) {
    return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 })
  }
  const { data, error } = await db.rpc('reclaim_team_lead', {
    p_lead_id: body.lead_id,
    p_actor_buyer_id: caller.id,
    p_member_id: body.member_id || null,
  })
  if (error) {
    console.error('[team/reclaim] transaction failed:', error.code)
    return NextResponse.json({ code: 'RECLAIM_FAILED' }, { status: 500 })
  }
  if (!data?.ok) {
    const status = data?.code === 'NOT_FOUND' ? 404
      : ['CONFLICT', 'ARCHIVED', 'NO_PIPELINE'].includes(data?.code) ? 409 : 403
    return NextResponse.json({ code: data?.code || 'FORBIDDEN' }, { status })
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
}
