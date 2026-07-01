import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getCommunityContext } from '@/lib/community-access'
import { getCrmPlan } from '@/lib/crm-plans'

/**
 * POST { buyerId, plan } — CORRETIVO: volta a assinatura de um buyer pro plano informado
 * SEM cobrar (proration_behavior:'none') e APAGA os itens de proração pendentes de uma troca
 * anterior (senão a diferença cairia na próxima fatura). Admin.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.me.isAdmin) return NextResponse.json({ error: 'Apenas admin.' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const plan = getCrmPlan(body?.plan)
    if (!plan) return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
    const buyerId = String(body?.buyerId || '').trim()
    if (!buyerId) return NextResponse.json({ error: 'buyerId obrigatório' }, { status: 400 })

    const { data: buyer } = await ctx.db
      .from('buyers')
      .select('id, name, crm_subscription_id')
      .eq('id', buyerId)
      .single()
    if (!buyer?.crm_subscription_id) return NextResponse.json({ error: 'Buyer sem assinatura' }, { status: 404 })

    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(buyer.crm_subscription_id)
    const item = sub.items.data[0]
    if (!item?.id) return NextResponse.json({ error: 'Item da assinatura não encontrado' }, { status: 400 })

    // Produto ativo pro price_data (reusa se ativo; senão cria próprio).
    let productId = typeof item.price.product === 'string' ? item.price.product : item.price.product.id
    let prodActive = false
    try { prodActive = (await stripe.products.retrieve(productId)).active } catch {}
    if (!prodActive) {
      productId = (await stripe.products.create({ name: `Lead4Producers CRM Pro — ${plan.label}` })).id
    }

    // Volta o preço SEM proração/cobrança.
    await stripe.subscriptions.update(sub.id, {
      items: [{
        id: item.id,
        price_data: {
          currency: 'usd',
          product: productId,
          unit_amount: plan.amountCents,
          recurring: { interval: plan.interval, interval_count: plan.intervalCount },
        },
      }],
      proration_behavior: 'none',
      metadata: { ...sub.metadata, plan: plan.key, interval: plan.interval },
    })

    // Apaga itens de proração pendentes (da troca anterior) pra não cobrar a diferença depois.
    const removed: string[] = []
    try {
      const pend = await stripe.invoiceItems.list({ customer: sub.customer as string, limit: 100 })
      for (const ii of pend.data as any[]) {
        if (ii.proration === true && !ii.invoice) {
          try { await stripe.invoiceItems.del(ii.id); removed.push(ii.id) } catch {}
        }
      }
    } catch {}

    await ctx.db.from('buyers').update({ crm_plan: 'pro', crm_billing_interval: plan.interval }).eq('id', buyer.id)

    return NextResponse.json({ ok: true, buyer: buyer.name, plan: plan.key, proracoesPendentesRemovidas: removed.length })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
