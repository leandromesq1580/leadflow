import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { coldPurchaseStatuses, coldStockByLanguage, deliverColdLeadsForPayment } from '@/lib/cold-leads'
import { notifyColdLeadsDelivered } from '@/lib/notifications'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireAdmin(db: ReturnType<typeof createAdminClient>) {
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Entre novamente na sua conta.' }, { status: 401, headers: NO_STORE })
  if (!caller.isAdmin) return NextResponse.json({ error: 'Apenas administradores.' }, { status: 403, headers: NO_STORE })
  return null
}

/** GET /api/admin/buyers/[id]/deliver-cold — compras de frio do comprador (entregue/restante) + estoque; ?payment_id=…&format=csv baixa os leads entregues. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createAdminClient()
  const denied = await requireAdmin(db)
  if (denied) return denied
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Comprador inválido.' }, { status: 400, headers: NO_STORE })
  const url = new URL(request.url)
  const paymentId = url.searchParams.get('payment_id')
  if (paymentId && url.searchParams.get('format') === 'csv') {
    if (!UUID.test(paymentId)) return NextResponse.json({ error: 'Pagamento inválido.' }, { status: 400, headers: NO_STORE })
    const { data: receipts } = await db.from('lead_delivery_receipts').select('lead_id, delivered_at').eq('payment_id', paymentId).eq('buyer_id', id).order('delivered_at', { ascending: true })
    const ids = (receipts || []).map(r => r.lead_id)
    const { data: leads } = ids.length ? await db.from('leads').select('id, name, phone, email, state, city, created_at').in('id', ids) : { data: [] as any[] }
    const byId = new Map((leads || []).map(l => [l.id, l]))
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = ['entregue_em,nome,telefone,email,estado,cidade,lead_criado_em']
    for (const r of receipts || []) { const l = byId.get(r.lead_id); if (l) lines.push([r.delivered_at, l.name, l.phone, l.email, l.state, l.city, l.created_at].map(esc).join(',')) }
    return new NextResponse(lines.join('\n'), { headers: { ...NO_STORE, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="leads-frios-${paymentId.slice(0, 8)}.csv"` } })
  }
  try {
    const [purchases, stock] = await Promise.all([coldPurchaseStatuses(db, id), coldStockByLanguage(db)])
    return NextResponse.json({ purchases, stock }, { headers: NO_STORE })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao consultar.' }, { status: 500, headers: NO_STORE })
  }
}

/** POST /api/admin/buyers/[id]/deliver-cold — body { payment_id, quantity } entrega leads frios do estoque pra compra. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createAdminClient()
  const denied = await requireAdmin(db)
  if (denied) return denied
  const { id } = await params
  const body = await request.json().catch(() => null) as { payment_id?: string; quantity?: number } | null
  const paymentId = String(body?.payment_id || '')
  const quantity = Number(body?.quantity)
  if (!UUID.test(id) || !UUID.test(paymentId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    return NextResponse.json({ error: 'Informe o pagamento e uma quantidade inteira (1–10.000).' }, { status: 400, headers: NO_STORE })
  }
  const { data: payment } = await db.from('payments').select('id, buyer_id').eq('id', paymentId).maybeSingle()
  if (!payment || payment.buyer_id !== id) return NextResponse.json({ error: 'Pagamento não pertence a este comprador.' }, { status: 404, headers: NO_STORE })
  try {
    const result = await deliverColdLeadsForPayment(db, paymentId, quantity, notifyColdLeadsDelivered)
    const [purchases, stock] = await Promise.all([coldPurchaseStatuses(db, id), coldStockByLanguage(db)])
    return NextResponse.json({ result, purchases, stock }, { headers: NO_STORE })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao entregar.' }, { status: 500, headers: NO_STORE })
  }
}
