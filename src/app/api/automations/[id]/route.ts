import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const db = createAdminClient()
  const updateData: Record<string, unknown> = {}
  for (const field of ['name', 'trigger_type', 'trigger_config', 'action_type', 'action_config', 'enabled']) {
    if (body[field] !== undefined) updateData[field] = body[field]
  }
  updateData.updated_at = new Date().toISOString()
  const { error } = await db.from('automations').update(updateData).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  await db.from('automations').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
