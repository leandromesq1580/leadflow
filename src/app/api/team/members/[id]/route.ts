import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer, canActAs } from '@/lib/api-auth'

export const maxDuration = 60
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** PATCH /api/team/members/[id] — Update or deactivate a member */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 })
  if (!uuid.test(id)) return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 })
  const { data: member, error: memberError } = await db.from('team_members').select('buyer_id').eq('id', id).maybeSingle()
  if (memberError) return NextResponse.json({ code: 'UPDATE_FAILED' }, { status: 500 })
  if (!member || !canActAs(caller, member.buyer_id)) return NextResponse.json({ code: 'FORBIDDEN' }, { status: 403 })
  const body = await request.json()
  const { name, email, phone, whatsapp, is_active } = body

  const update: Record<string, unknown> = {}
  if (name !== undefined) update.name = name
  if (email !== undefined) update.email = email
  if (phone !== undefined) update.phone = phone
  if (whatsapp !== undefined) update.whatsapp = whatsapp
  if (is_active !== undefined) update.is_active = is_active

  const { data, error } = await db.from('team_members').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data })
}

/** Remove only the membership, atomically reclaiming its delegated leads. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 })
  if (!uuid.test(id)) return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 })
  const { data, error } = await db.rpc('remove_team_member', {
    p_member_id: id,
    p_actor_buyer_id: caller.id,
  })
  if (error) {
    console.error('[team/remove] transaction failed:', error.code)
    const code = error.message === 'TEAM_REMOVAL_NO_PIPELINE' ? 'NO_PIPELINE'
      : error.message === 'TEAM_REMOVAL_CONFLICT' ? 'CONFLICT' : 'REMOVE_FAILED'
    return NextResponse.json({ code }, { status: code === 'REMOVE_FAILED' ? 500 : 409 })
  }
  if (!data?.ok) return NextResponse.json({ code: data?.code || 'REMOVE_FAILED' }, { status: data?.code === 'FORBIDDEN' ? 403 : 500 })
  return NextResponse.json({ ...data, success: true }, { headers: { 'Cache-Control': 'private, no-store' } })
}
