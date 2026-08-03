import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { kpisDe, type Policy } from '@/lib/insurance-policies'
import { acessoApolices } from '@/lib/policies-access'

export const dynamic = 'force-dynamic'

/**
 * /api/apolices — gestão de apólices do corretor logado (pós-venda).
 * GET    lista + KPIs · POST cria · PATCH atualiza · DELETE remove
 * Acesso restrito: só quem está liberado ou conectou a própria seguradora (403).
 * Tolerante: enquanto a migration 036 não roda, devolve lista vazia + needsMigration.
 */

const CAMPOS = [
  'lead_id', 'client_name', 'client_phone', 'client_email', 'policy_number', 'carrier', 'product',
  'coverage_cents', 'premium_cents', 'premium_mode', 'status', 'submitted_at', 'issued_at',
  'effective_date', 'paid_through', 'requirements', 'amount_due_cents', 'due_date',
  'next_action', 'notes', 'beneficiary', 'last_contact_at', 'done_at',
] as const

function limpar(body: any) {
  const out: Record<string, unknown> = {}
  for (const c of CAMPOS) {
    if (body[c] === undefined) continue
    let v = body[c]
    if (v === '') v = null
    if (c === 'requirements' && v && !Array.isArray(v)) v = String(v).split(',').map(s => s.trim()).filter(Boolean)
    out[c] = v
  }
  return out
}

export async function GET() {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const acesso = await acessoApolices(db, caller.id)
  if (!acesso.pode) return NextResponse.json({ error: 'Recurso não habilitado nesta conta.' }, { status: 403 })
  try {
    const { data, error } = await db.from('policies').select('*')
      .eq('buyer_id', acesso.bookDe).order('updated_at', { ascending: false })
    if (error) throw error
    const lista = (data || []) as Policy[]
    return NextResponse.json({ policies: lista, kpis: kpisDe(lista) })
  } catch (e: any) {
    if (/does not exist|relation/i.test(e?.message || '')) {
      return NextResponse.json({ policies: [], kpis: kpisDe([]), needsMigration: true })
    }
    return NextResponse.json({ error: e?.message || 'Falha ao carregar' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const acesso = await acessoApolices(db, caller.id)
  if (!acesso.pode) return NextResponse.json({ error: 'Recurso não habilitado nesta conta.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  if (!String(body.client_name || '').trim()) {
    return NextResponse.json({ error: 'Informe o nome do cliente.' }, { status: 400 })
  }
  try {
    const { data, error } = await db.from('policies')
      .insert({ ...limpar(body), buyer_id: acesso.bookDe }).select().single()
    if (error) throw error
    return NextResponse.json({ policy: data })
  } catch (e: any) {
    if (/does not exist|relation/i.test(e?.message || '')) {
      return NextResponse.json({ error: 'Recurso em ativação — rode a migration 036.' }, { status: 503 })
    }
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const acesso = await acessoApolices(db, caller.id)
  if (!acesso.pode) return NextResponse.json({ error: 'Recurso não habilitado nesta conta.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  try {
    const { data, error } = await db.from('policies')
      .update({ ...limpar(body), updated_at: new Date().toISOString() })
      .eq('id', body.id).eq('buyer_id', acesso.bookDe)  // só a própria apólice
      .select().single()
    if (error) throw error
    return NextResponse.json({ policy: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const acesso = await acessoApolices(db, caller.id)
  if (!acesso.pode) return NextResponse.json({ error: 'Recurso não habilitado nesta conta.' }, { status: 403 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const { error } = await db.from('policies').delete().eq('id', id).eq('buyer_id', acesso.bookDe)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
