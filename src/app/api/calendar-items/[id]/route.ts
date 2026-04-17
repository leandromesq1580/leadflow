import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const db = createAdminClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of ['title', 'description', 'start_at', 'end_at', 'all_day', 'location', 'attendees', 'color', 'lead_id']) {
    if (body[f] !== undefined) update[f] = body[f]
  }
  // Handle completed toggle separately (for tasks)
  if (body.completed === true) update.completed_at = new Date().toISOString()
  if (body.completed === false) update.completed_at = null
  const { data, error } = await db.from('calendar_items').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const { error } = await db.from('calendar_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
