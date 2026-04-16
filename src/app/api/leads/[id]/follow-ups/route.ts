import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const db = createAdminClient()
  const { data } = await db.from('follow_ups').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })
  return NextResponse.json({ followUps: data || [] })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const { buyer_id, type, description, scheduled_at } = await request.json()
  const db = createAdminClient()

  const { data, error } = await db
    .from('follow_ups')
    .insert({ lead_id: leadId, buyer_id, type: type || 'note', description, scheduled_at: scheduled_at || null })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ followUp: data })
}
