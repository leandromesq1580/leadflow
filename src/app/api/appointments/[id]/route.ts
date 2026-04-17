import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const db = createAdminClient()
  const update: Record<string, unknown> = {}
  if (body.scheduled_at !== undefined) update.scheduled_at = body.scheduled_at
  if (body.status !== undefined) update.status = body.status
  if (body.qualification_notes !== undefined) update.qualification_notes = body.qualification_notes
  const { data, error } = await db.from('appointments').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ appointment: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const { error } = await db.from('appointments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
