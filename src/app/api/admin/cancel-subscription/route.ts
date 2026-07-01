import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getCommunityContext } from '@/lib/community-access'

/**
 * POST { buyerId, immediate? } — cancela a assinatura CRM do buyer. Admin.
 * Padrão: cancel_at_period_end = mantém o acesso que ela JÁ PAGOU até o fim do ciclo,
 * não renova, e NÃO reembolsa. immediate:true corta o acesso na hora.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.me.isAdmin) return NextResponse.json({ error: 'Apenas admin.' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const buyerId = String(body?.buyerId || '').trim()
    if (!buyerId) return NextResponse.json({ error: 'buyerId obrigatório' }, { status: 400 })

    const { data: buyer } = await ctx.db.from('buyers').select('id, name, crm_subscription_id').eq('id', buyerId).single()
    if (!buyer?.crm_subscription_id) return NextResponse.json({ error: 'Buyer sem assinatura ativa' }, { status: 404 })

    const stripe = getStripe()
    if (body?.immediate === true) {
      const s = await stripe.subscriptions.cancel(buyer.crm_subscription_id)
      return NextResponse.json({ ok: true, buyer: buyer.name, modo: 'imediato', status: s.status })
    }

    const s: any = await stripe.subscriptions.update(buyer.crm_subscription_id, { cancel_at_period_end: true })
    const end = s.current_period_end || s.items?.data?.[0]?.current_period_end
    return NextResponse.json({
      ok: true,
      buyer: buyer.name,
      modo: 'no_fim_do_ciclo',
      cancel_at_period_end: s.cancel_at_period_end,
      status: s.status,
      acessoAte: end ? new Date(end * 1000).toISOString() : null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
