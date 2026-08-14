import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'

const MISSING_TABLE = /relation .*lead_forms.* does not exist|could not find the table/i

/**
 * GET /api/leads/[id]/forms — histórico de aplicações (formulários) do lead, mais recente primeiro.
 * Se a tabela ainda não foi criada (migration 021 não rodada), devolve lista vazia + needsMigration.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: leadId } = await params
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const db = createAdminClient()
    const { data, error } = await db
      .from('lead_forms')
      .select('*')
      .eq('lead_id', leadId)
      .neq('form_type', 'draft')   // rascunho em andamento não é histórico
      .order('created_at', { ascending: false })
    if (error) {
      if (MISSING_TABLE.test(error.message)) return NextResponse.json({ forms: [], needsMigration: true })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ forms: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/**
 * POST /api/leads/[id]/forms — salva uma nova aplicação.
 * Body: { buyer_id, data }  (data = objeto com os campos do formulário + paths dos documentos)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: leadId } = await params
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const { buyer_id, data } = body
    if (!buyer_id) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

    const db = createAdminClient()
    const { data: row, error } = await db
      .from('lead_forms')
      .insert({ lead_id: leadId, buyer_id, created_by: buyer_id, form_type: 'national_life', data: data || {} })
      .select()
      .single()
    if (error) {
      if (MISSING_TABLE.test(error.message)) {
        return NextResponse.json({ error: 'A tabela lead_forms ainda não existe no banco. Rode a migration supabase/migrations/021_lead_forms.sql.' }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ form: row })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/**
 * DELETE /api/leads/[id]/forms — remove uma aplicação do histórico.
 * Body: { form_id }
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: leadId } = await params
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { form_id } = await request.json()
    if (!form_id) return NextResponse.json({ error: 'Missing form_id' }, { status: 400 })
    const db = createAdminClient()
    const { error } = await db.from('lead_forms').delete().eq('id', form_id).eq('lead_id', leadId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
