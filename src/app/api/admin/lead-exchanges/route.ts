import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { leadLanguageForLead } from '@/lib/lead-language'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supa = await createServerSupabase()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return null
  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('id, is_admin').eq('auth_user_id', user.id).single()
  return me?.is_admin ? db : null
}

/** GET /api/admin/lead-exchanges — pedidos de troca com dossiê (admin). */
export async function GET() {
  const db = await requireAdmin()
  if (!db) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const { data } = await db.from('lead_exchange_requests')
      .select('id, status, evidence, requested_at, decided_at, lead:leads(id, name, phone, state), buyer:buyers(id, name, email)')
      .order('requested_at', { ascending: false }).limit(100)
    return NextResponse.json({ requests: data || [] })
  } catch (e: any) {
    return NextResponse.json({ requests: [], needsMigration: true, error: e?.message })
  }
}

/**
 * POST /api/admin/lead-exchanges — { id, action: 'approve' | 'deny' }.
 * Aprovar: +1 crédito de lead ao comprador (compensação, preço 0) e o lead volta
 * pro estoque como FRIO (sem dono, status new) pra revenda. Negar: só marca.
 */
export async function POST(request: NextRequest) {
  const db = await requireAdmin()
  if (!db) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, action } = await request.json()
  if (!id || !['approve', 'deny'].includes(action)) {
    return NextResponse.json({ error: 'id e action (approve|deny) obrigatórios' }, { status: 400 })
  }

  const { data: req } = await db.from('lead_exchange_requests')
    .select('id, lead_id, buyer_id, status').eq('id', id).maybeSingle()
  if (!req) return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 })
  if (req.status !== 'pending') return NextResponse.json({ error: `Pedido já ${req.status}` }, { status: 409 })

  if (action === 'approve') {
    const { data: lead } = await db.from('leads').select('lead_language, form_name, meta_lead_id').eq('id', req.lead_id).single()
    const language = lead ? leadLanguageForLead(lead) : null
    if (!language) return NextResponse.json({ error: 'Confirme o idioma do lead antes de devolver o crédito.' }, { status: 409 })
    // 1) devolve o crédito (idempotente pelo marker)
    const marker = `exchange:${req.lead_id}`
    const { data: dup } = await db.from('credits').select('id').eq('stripe_payment_id', marker).maybeSingle()
    if (!dup) {
      const { error: credErr } = await db.from('credits').insert({
        buyer_id: req.buyer_id, type: 'lead', total_purchased: 1, total_used: 0,
        lead_language: language,
        price_per_unit: 0, stripe_payment_id: marker, purchased_at: new Date().toISOString(),
      })
      if (credErr) return NextResponse.json({ error: 'Falha ao creditar: ' + credErr.message }, { status: 500 })
    }
    // 2) lead volta pro estoque como FRIO
    const { error: leadErr } = await db.from('leads').update({
      assigned_to: null, assigned_to_member: null, assigned_at: null,
      status: 'new', type: 'cold',
    }).eq('id', req.lead_id)
    if (leadErr) return NextResponse.json({ error: 'Crédito ok, mas falha ao reciclar lead: ' + leadErr.message }, { status: 500 })
  }

  await db.from('lead_exchange_requests')
    .update({ status: action === 'approve' ? 'approved' : 'denied', decided_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ ok: true, status: action === 'approve' ? 'approved' : 'denied' })
}
