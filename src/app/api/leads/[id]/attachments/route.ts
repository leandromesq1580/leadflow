import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const db = createAdminClient()
  const { data } = await db.from('lead_attachments').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })
  return NextResponse.json({ attachments: data || [] })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const formData = await request.formData()
  const file = formData.get('file') as File
  const buyerId = formData.get('buyer_id') as string

  if (!file || !buyerId) return NextResponse.json({ error: 'Missing file or buyer_id' }, { status: 400 })

  const db = createAdminClient()
  const ext = file.name.split('.').pop()
  const path = `${leadId}/${Date.now()}-${file.name}`

  // Upload to Supabase Storage
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await db.storage.from('lead-attachments').upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // Save metadata
  const { data, error } = await db.from('lead_attachments').insert({
    lead_id: leadId,
    buyer_id: buyerId,
    file_name: file.name,
    file_path: path,
    file_size: file.size,
    file_type: file.type,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ attachment: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const { attachment_id } = await request.json()
  const db = createAdminClient()

  const { data: att } = await db.from('lead_attachments').select('file_path').eq('id', attachment_id).single()
  if (att) await db.storage.from('lead-attachments').remove([att.file_path])
  await db.from('lead_attachments').delete().eq('id', attachment_id)

  return NextResponse.json({ success: true })
}
