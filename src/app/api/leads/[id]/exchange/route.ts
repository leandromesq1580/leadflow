import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { checkExchangeEligibility } from '@/lib/lead-exchange'
import { notifyAdmins } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/leads/[id]/exchange — propriedade + status do pedido (comprador logado).
 * POST /api/leads/[id]/exchange — declara telefone/e-mail inválido e solicita análise.
 * Aprovação é manual no /admin/trocas.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let existing: any = null
  try {
    const { data } = await db.from('lead_exchange_requests')
      .select('id, status, requested_at, decided_at').eq('lead_id', leadId).maybeSingle()
    existing = data
  } catch { /* migration 032 pendente */ }

  const elig = await checkExchangeEligibility(db, leadId, caller.id)
  return NextResponse.json({ ...elig, request: existing })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const invalidContact = typeof body.invalid_contact === 'string' ? body.invalid_contact : null
  const details = typeof body.details === 'string' ? body.details : null
  const elig = await checkExchangeEligibility(db, leadId, caller.id, { invalidContact, details })
  if (!elig.eligible) {
    return NextResponse.json({ error: 'Lead não elegível: ' + elig.reasons.join(' ') }, { status: 400 })
  }

  const { data: req, error } = await db.from('lead_exchange_requests')
    .insert({ lead_id: leadId, buyer_id: caller.id, evidence: elig.dossier })
    .select().single()
  if (error) {
    const needsMigration = /does not exist/i.test(error.message)
    return NextResponse.json({
      error: needsMigration ? 'Recurso em ativação — tente mais tarde.' : (
        /duplicate|unique/i.test(error.message) ? 'Já existe um pedido de troca para este lead.' : error.message),
    }, { status: needsMigration ? 503 : 400 })
  }

  try {
    const { data: b } = await db.from('buyers').select('name, email').eq('id', caller.id).maybeSingle()
    const { data: l } = await db.from('leads').select('name, state').eq('id', leadId).maybeSingle()
    const d = elig.dossier
    const contactLabel = d.invalidContact === 'both' ? 'telefone e e-mail' : d.invalidContact === 'email' ? 'e-mail' : 'telefone'
    await notifyAdmins(
      `🔁 *SOLICITAÇÃO DE TROCA DE LEAD*\n\n👤 ${b?.name || b?.email}\n📋 Lead: ${l?.name || leadId} (${l?.state || '?'})\n` +
      `⚠️ Contato declarado inválido: ${contactLabel}\n` +
      `${d.details ? `📝 ${d.details}\n` : ''}\nVerificar e decidir em: lead4producers.com/admin/trocas`
    )
  } catch { /* aviso é best-effort */ }

  return NextResponse.json({ ok: true, request: req })
}
