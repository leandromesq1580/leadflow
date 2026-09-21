import { createAdminClient } from './supabase/admin'
import type { LeadLanguage } from './lead-language'

/**
 * Mark leads older than 7 days as cold if not assigned.
 * Called periodically or on-demand.
 */
export async function markColdLeads() {
  const db = createAdminClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await db
    .from('leads')
    .update({ type: 'cold' })
    .eq('status', 'new')
    .eq('type', 'hot')
    .lt('created_at', sevenDaysAgo)
    .select('id')

  if (data && data.length > 0) {
    console.log(`[ColdLeads] Marked ${data.length} leads as cold`)
  }

  return data?.length || 0
}

/**
 * Distribute cold leads to a buyer who purchased cold_lead credits.
 * Assigns oldest cold leads first.
 */
export async function distributeColdLeads(buyerId: string, quantity: number, language: LeadLanguage): Promise<number> {
  const db = createAdminClient()

  // First mark any old leads as cold
  await markColdLeads()

  // Get buyer's states
  const { data: buyerStates } = await db
    .from('buyer_states')
    .select('state_code')
    .eq('buyer_id', buyerId)

  const states = buyerStates?.map(s => s.state_code) || []

  // Get cold unassigned leads, filtered by buyer's states
  let query = db
    .from('leads')
    .select('id')
    .eq('type', 'cold')
    .eq('status', 'new')
    .eq('lead_language', language)
    .is('assigned_to', null)
    .order('created_at', { ascending: true })
    .limit(quantity)

  // Filter by state if buyer has states configured
  if (states.length > 0) {
    query = query.in('state', states)
  }

  const { data: coldLeads } = await query

  if (!coldLeads || coldLeads.length === 0) {
    console.log('[ColdLeads] No cold leads available')
    return 0
  }

  // Assign each cold lead to the buyer
  const leadIds = coldLeads.map(l => l.id)

  const { error } = await db
    .from('leads')
    .update({
      assigned_to: buyerId,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
    })
    .in('id', leadIds)

  if (error) {
    console.error('[ColdLeads] Failed to assign:', error)
    return 0
  }

  console.log(`[ColdLeads] Distributed ${leadIds.length} cold leads to buyer ${buyerId}`)
  return leadIds.length
}

// ============================================================================
// ESTOQUE E ENTREGA COM RECIBO (2026-09-21)
//
// Por que: em 20/07 um cliente pagou $300 por 100 leads frios com estoque ZERO —
// o sistema "entregou" 0 em silêncio, a entrega virou planilha manual sem rastro e
// virou chargeback sem defesa. Regras novas:
//  1. O checkout só vende pacote frio se houver estoque no idioma (countColdStock).
//  2. A entrega é feita pelo admin na ficha do comprador (deliverColdLeadsForPayment):
//     atribui leads frios reais ao comprador → o trigger capture_lead_delivery_receipt
//     gera lead_delivery_receipts (append-only) ligados ao pagamento via crédito, o
//     comprador é avisado (e-mail + WhatsApp) e a notificação fica em
//     lead_notification_receipts. Nada de planilha sem registro.
// ============================================================================
import type { createAdminClient as CreateAdminClient } from './supabase/admin'
import { LEAD_LANGUAGES } from './lead-language'
type Db = ReturnType<typeof CreateAdminClient>

/** Leads frios disponíveis pra venda/entrega: type=cold, novos, sem dono, não arquivados. */
function coldStockQuery(db: Db, language: LeadLanguage | null) {
  let q = db.from('leads').select('id', { count: 'exact', head: true })
    .eq('type', 'cold').eq('status', 'new').is('assigned_to', null).not('archived', 'is', true)
  if (language) q = q.eq('lead_language', language)
  return q
}

export async function countColdStock(db: Db, language: LeadLanguage | null): Promise<number> {
  const { count, error } = await coldStockQuery(db, language)
  if (error) throw new Error('Não foi possível consultar o estoque de leads frios. Tente novamente.')
  return count || 0
}

export async function coldStockByLanguage(db: Db): Promise<Record<LeadLanguage, number>> {
  const out = {} as Record<LeadLanguage, number>
  for (const language of LEAD_LANGUAGES) out[language] = await countColdStock(db, language)
  return out
}

export interface ColdPurchaseStatus {
  payment_id: string
  created_at: string
  quantity: number
  amount: number
  lead_language: LeadLanguage | null
  delivered: number
  remaining: number
}

/** Compras de lead frio do comprador com quanto já foi entregue (recibos append-only). */
export async function coldPurchaseStatuses(db: Db, buyerId: string): Promise<ColdPurchaseStatus[]> {
  const { data: payments, error } = await db.from('payments')
    .select('id, created_at, quantity, amount, lead_language, stripe_payment_intent_id, stripe_session_id')
    .eq('buyer_id', buyerId).eq('product_type', 'cold_lead').eq('status', 'completed')
    .order('created_at', { ascending: true })
  if (error) throw new Error('Não foi possível ler as compras de leads frios.')
  const out: ColdPurchaseStatus[] = []
  for (const p of payments || []) {
    const { count } = await db.from('lead_delivery_receipts').select('id', { count: 'exact', head: true }).eq('payment_id', p.id)
    const delivered = count || 0
    out.push({
      payment_id: p.id, created_at: p.created_at, quantity: Number(p.quantity || 0), amount: Number(p.amount || 0),
      lead_language: (p.lead_language as LeadLanguage) || null, delivered, remaining: Math.max(0, Number(p.quantity || 0) - delivered),
    })
  }
  return out
}

export interface ColdDeliveryResult {
  delivered: number
  remaining: number
  stock_after: number
  notified: { email: boolean; whatsapp: boolean }
  leads: Array<{ id: string; name: string | null; phone: string | null; email: string | null; state: string | null; city: string | null; created_at: string }>
}

/**
 * Entrega (no sistema) até `requested` leads frios de uma compra paga. Idempotente por
 * recibo: nunca passa da quantidade comprada. Estados licenciados do comprador têm
 * preferência; o resto vem do estoque geral do mesmo idioma.
 */
export async function deliverColdLeadsForPayment(
  db: Db,
  paymentId: string,
  requested: number,
  notify: (buyer: { id: string; name: string; email: string; phone: string | null; notification_phone_2?: string | null }, count: number, language: LeadLanguage) => Promise<{ email: boolean; whatsapp: boolean }>,
): Promise<ColdDeliveryResult> {
  const { data: payment, error: payError } = await db.from('payments')
    .select('id, buyer_id, quantity, amount, price_per_unit, lead_language, stripe_payment_intent_id, stripe_session_id, product_type, status, created_at')
    .eq('id', paymentId).maybeSingle()
  if (payError) throw new Error('Não foi possível ler o pagamento.')
  if (!payment || payment.product_type !== 'cold_lead' || payment.status !== 'completed') throw new Error('Pagamento de leads frios não encontrado.')
  const language = payment.lead_language as LeadLanguage
  if (!LEAD_LANGUAGES.includes(language)) throw new Error('Compra sem idioma definido — corrija o pagamento antes de entregar.')

  const { count: deliveredSoFar } = await db.from('lead_delivery_receipts').select('id', { count: 'exact', head: true }).eq('payment_id', payment.id)
  const remainingBefore = Math.max(0, Number(payment.quantity) - (deliveredSoFar || 0))
  const want = Math.min(Math.max(0, Math.floor(requested)), remainingBefore)
  if (want <= 0) return { delivered: 0, remaining: remainingBefore, stock_after: await countColdStock(db, language), notified: { email: false, whatsapp: false }, leads: [] }

  const { data: buyer } = await db.from('buyers').select('id, name, email, phone, notification_phone_2').eq('id', payment.buyer_id).maybeSingle()
  if (!buyer) throw new Error('Comprador não encontrado.')

  // crédito que liga a entrega ao pagamento (o trigger de recibo resolve payment_id por ele)
  const reference = payment.stripe_payment_intent_id || payment.stripe_session_id
  let credit = (await db.from('credits').select('id, total_used').eq('buyer_id', buyer.id).eq('type', 'cold_lead').eq('stripe_payment_id', reference).maybeSingle()).data
  if (!credit) {
    const { data: created, error: creditError } = await db.from('credits').insert({
      buyer_id: buyer.id, type: 'cold_lead', lead_language: language, total_purchased: Number(payment.quantity), total_used: 0,
      price_per_unit: Number(payment.price_per_unit || 0), stripe_payment_id: reference, purchased_at: payment.created_at,
    }).select('id, total_used').single()
    if (creditError || !created) throw new Error('Não foi possível registrar o crédito da compra.')
    credit = created
  }

  // estados licenciados primeiro, depois o estoque geral do idioma
  const { data: stateRows } = await db.from('buyer_states').select('state_code').eq('buyer_id', buyer.id)
  const states = (stateRows || []).map(r => r.state_code)
  const pick = async (limit: number, onlyStates: boolean, exclude: string[]) => {
    let q = db.from('leads').select('id').eq('type', 'cold').eq('status', 'new').is('assigned_to', null).not('archived', 'is', true)
      .eq('lead_language', language).order('created_at', { ascending: true }).limit(limit)
    if (onlyStates) q = q.in('state', states)
    const { data } = await q
    return (data || []).map(r => r.id).filter(id => !exclude.includes(id))
  }
  let ids: string[] = states.length ? await pick(want, true, []) : []
  if (ids.length < want) ids = ids.concat(await pick(want, false, ids)).slice(0, want)
  if (!ids.length) return { delivered: 0, remaining: remainingBefore, stock_after: 0, notified: { email: false, whatsapp: false }, leads: [] }

  const now = new Date().toISOString()
  const { data: assigned, error: assignError } = await db.from('leads')
    .update({ assigned_to: buyer.id, assigned_at: now, status: 'assigned', delivery_credit_id: credit.id })
    .in('id', ids).is('assigned_to', null)
    .select('id, name, phone, email, state, city, created_at')
  if (assignError) throw new Error('Não foi possível atribuir os leads frios.')
  const delivered = assigned || []
  if (delivered.length) {
    await db.from('credits').update({ total_used: Number(credit.total_used || 0) + delivered.length }).eq('id', credit.id)
  }

  let notified = { email: false, whatsapp: false }
  if (delivered.length) {
    try { notified = await notify(buyer, delivered.length, language) } catch (e) { console.error('[ColdLeads] aviso ao comprador falhou:', e) }
    // recibo da notificação (append-only), um por lead entregue
    const { data: receipts } = await db.from('lead_delivery_receipts').select('id, lead_id').eq('buyer_id', buyer.id).in('lead_id', delivered.map(l => l.id))
    const rows = (receipts || []).map(r => ({
      lead_id: r.lead_id, buyer_id: buyer.id, delivery_receipt_id: r.id,
      channel: 'cold_delivery_summary', status: notified.email || notified.whatsapp ? 'completed' : 'failed', notified_at: now,
    }))
    if (rows.length) await db.from('lead_notification_receipts').insert(rows)
  }
  const stockAfter = await countColdStock(db, language)
  return { delivered: delivered.length, remaining: Math.max(0, remainingBefore - delivered.length), stock_after: stockAfter, notified, leads: delivered }
}
