import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { checkExchangeEligibility } from '@/lib/lead-exchange'
import { notifyAdmins } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/leads/[id]/exchange — elegibilidade + status do pedido (comprador logado).
 * POST /api/leads/[id]/exchange — solicita a troca (valida elegibilidade no servidor).
 * Regra (2026-07-25): 14 dias trabalhados (≥8 dias com tentativa) + 0 respostas;
 * teto de 30% dos leads pagos. Aprovação é manual no /admin/trocas.
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

  const elig = await checkExchangeEligibility(db, leadId, caller.id)
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
    await notifyAdmins(
      `🔁 *SOLICITAÇÃO DE TROCA DE LEAD*\n\n👤 ${b?.name || b?.email}\n📋 Lead: ${l?.name || leadId} (${l?.state || '?'})\n` +
      `📊 ${d.attemptDays} dias c/ tentativa · ${d.calls} ligações · ${d.smsSent} SMS · 0 respostas\n` +
      `Teto: ${d.capUsed + 1}/${d.capMax}\n\nAprovar em: lead4producers.com/admin/trocas`
    )
  } catch { /* aviso é best-effort */ }

  return NextResponse.json({ ok: true, request: req })
}
