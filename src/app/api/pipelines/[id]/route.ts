import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { name, is_default } = await request.json()
  const db = createAdminClient()
  const update: Record<string, unknown> = {}
  if (name !== undefined) update.name = name
  if (is_default !== undefined) update.is_default = is_default
  const { data, error } = await db.from('pipelines').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pipeline: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  await db.from('pipeline_leads').delete().eq('pipeline_id', id)
  await db.from('pipeline_stages').delete().eq('pipeline_id', id)
  const { error } = await db.from('pipelines').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
