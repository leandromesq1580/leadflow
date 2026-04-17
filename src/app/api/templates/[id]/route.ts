import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const db = createAdminClient()
  const update: Record<string, unknown> = {}
  if (body.name !== undefined) update.name = body.name
  if (body.subject !== undefined) update.subject = body.subject
  if (body.body !== undefined) update.body = body.body
  if (body.type !== undefined) update.type = body.type

  // Can't edit system templates
  const { data: tpl } = await db.from('templates').select('is_system').eq('id', id).single()
  if (tpl?.is_system) return NextResponse.json({ error: 'Cannot edit system template' }, { status: 403 })

  const { data, error } = await db.from('templates').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const { data: tpl } = await db.from('templates').select('is_system').eq('id', id).single()
  if (tpl?.is_system) return NextResponse.json({ error: 'Cannot delete system template' }, { status: 403 })
  const { error } = await db.from('templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
