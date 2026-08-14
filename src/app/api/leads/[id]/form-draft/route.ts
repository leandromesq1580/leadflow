import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Rascunho da aplicação SINCRONIZADO NO SERVIDOR (14/08 — caso Maria Costa).
 *
 * Antes o rascunho vivia só no localStorage do navegador: a corretora começava
 * no computador e o celular (ou o "Ver como" do admin) não enxergava nada.
 * Agora: um rascunho por lead na própria lead_forms com form_type='draft'
 * (linha que o histórico ignora e que morre quando a aplicação é salva).
 */

async function autorizado() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  if (!(await autorizado())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  const { data } = await db.from('lead_forms')
    .select('id, data, updated_at')
    .eq('lead_id', leadId).eq('form_type', 'draft')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  return NextResponse.json({ draft: data || null })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  if (!(await autorizado())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({} as { buyer_id?: string; data?: unknown }))
  if (!body.buyer_id || !body.data) return NextResponse.json({ error: 'Missing buyer_id/data' }, { status: 400 })

  const db = createAdminClient()
  const { data: existente } = await db.from('lead_forms')
    .select('id').eq('lead_id', leadId).eq('form_type', 'draft').limit(1).maybeSingle()

  if (existente) {
    const { error } = await db.from('lead_forms')
      .update({ data: body.data, updated_at: new Date().toISOString() }).eq('id', existente.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await db.from('lead_forms').insert({
      lead_id: leadId, buyer_id: body.buyer_id, created_by: body.buyer_id,
      form_type: 'draft', data: body.data,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  if (!(await autorizado())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  await db.from('lead_forms').delete().eq('lead_id', leadId).eq('form_type', 'draft')
  return NextResponse.json({ ok: true })
}
