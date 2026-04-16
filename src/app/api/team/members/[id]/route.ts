import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** PATCH /api/team/members/[id] — Update or deactivate a member */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const { name, email, phone, whatsapp, is_active } = body

  const db = createAdminClient()
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

/** DELETE /api/team/members/[id] — Remove a member */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const { error } = await db.from('team_members').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
