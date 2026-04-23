import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const db = createAdminClient()
  const update: Record<string, unknown> = {}
  if (body.description !== undefined) update.description = body.description
  if (body.type !== undefined) update.type = body.type
  if (body.scheduled_at !== undefined) update.scheduled_at = body.scheduled_at
  if (body.completed !== undefined) {
    update.completed_at = body.completed ? new Date().toISOString() : null
    update.status = body.completed ? 'completed' : 'pending'
  }
  if (body.status !== undefined) {
    update.status = body.status
    update.completed_at = body.status === 'completed' ? new Date().toISOString() : null
  }

  const { data, error } = await db.from('follow_ups').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ followUp: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const { error } = await db.from('follow_ups').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
