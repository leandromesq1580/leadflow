import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { LEADS_PER_MONTH, CRM_PLAN_LIST } from '@/lib/crm-plans'
import { notifyGroupPurchase } from '@/lib/notifications'
import Stripe from 'stripe'

/**
 * POST /api/webhook/stripe
 * Handle Stripe webhook events (payment completed, etc.)
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      // UPGRADE de plano CRM: o cliente pagou a diferença via checkout (uma NOVA assinatura do
      // novo plano foi criada e será sincronizada pelo handler customer.subscription.created).
      // Aqui só CANCELAMOS a assinatura ANTIGA.
      if (session.metadata?.kind === 'crm_upgrade') {
        const oldSubId = session.metadata.old_subscription_id
        if (oldSubId) {
          try { await getStripe().subscriptions.cancel(oldSubId) } catch (e: any) { console.error('[Stripe Webhook] cancelar sub antiga falhou:', e?.message) }
          console.log(`[Stripe Webhook] CRM upgrade: assinatura antiga ${oldSubId} cancelada`)
        }
        break
      }

      const buyerId = session.metadata?.buyer_id
      const productType = session.metadata?.product_type as 'lead' | 'cold_lead' | 'appointment'
      const quantity = parseInt(session.metadata?.quantity || '0', 10)
      const pricePerUnit = parseFloat(session.metadata?.price_per_unit || '0')

      if (!buyerId || !productType || !quantity) {
        console.error('[Stripe Webhook] Missing metadata:', session.metadata)
        break
      }

      console.log(`[Stripe Webhook] Payment completed: ${quantity} ${productType}s for buyer ${buyerId}`)

      // Lead FRIO (jul/2026, opção B): a compra SÓ registra o pagamento — NÃO gera crédito e
      // NÃO auto-atribui/entra na fila. Entrega é MANUAL (planilha) pelo admin. Lead quente e
      // demais produtos seguem gerando crédito normalmente.
      const isColdLead = productType === 'cold_lead'

      // Create credits for buyer (pula lead frio — entrega manual, sem crédito)
      if (!isColdLead) {
        const { error: creditError } = await supabase.from('credits').insert({
          buyer_id: buyerId,
          type: productType,
          total_purchased: quantity,
          total_used: 0,
          price_per_unit: pricePerUnit,
          stripe_payment_id: session.payment_intent as string,
          purchased_at: new Date().toISOString(),
        })

        if (creditError) {
          console.error('[Stripe Webhook] Failed to create credits:', creditError)
        }
      }

      // Record payment
      const { error: paymentError } = await supabase.from('payments').insert({
        buyer_id: buyerId,
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent as string,
        amount: (session.amount_total || 0) / 100,
        product_type: productType,
        quantity,
        price_per_unit: pricePerUnit,
        status: 'completed',
      })

      if (paymentError) {
        console.error('[Stripe Webhook] Failed to record payment:', paymentError)
      }

      // Lead frio: entrega MANUAL (planilha). NÃO auto-distribui nem debita crédito (opção B).
      if (isColdLead) {
        console.log(`[Stripe Webhook] Lead FRIO pago: ${quantity} p/ buyer ${buyerId} — entrega MANUAL (planilha), sem crédito e sem auto-atribuição.`)
      }

      // Se comprou appointment e ainda nao tem CRM, vira perfil "appointment-only"
      // (libera so a agenda + comprar + config; NUNCA rebaixa quem ja e pro/trial/admin).
      if (productType === 'appointment') {
        const { data: b } = await supabase.from('buyers')
          .select('crm_plan, is_admin, trial_ends_at').eq('id', buyerId).single()
        const hasCrm = !!b?.is_admin || b?.crm_plan === 'pro' ||
          (!!b?.trial_ends_at && new Date(b.trial_ends_at).getTime() > Date.now())
        if (!hasCrm && b?.crm_plan !== 'appointment') {
          await supabase.from('buyers').update({ crm_plan: 'appointment' }).eq('id', buyerId)
          console.log(`[Stripe Webhook] Buyer ${buyerId} marcado como appointment-only`)
        }
      }

      // Update buyer's Stripe customer ID if not set
      if (session.customer) {
        await supabase
          .from('buyers')
          .update({ stripe_customer_id: session.customer as string })
          .eq('id', buyerId)
          .is('stripe_customer_id', null)
      }

      // 🔔 Avisa o grupo de controle sobre a compra do pacote (nome, email, o que, valor)
      try {
        const { data: pBuyer } = await supabase.from('buyers').select('name, email').eq('id', buyerId).single()
        const labelMap: Record<string, string> = { lead: 'Leads', cold_lead: 'Leads Frios', appointment: 'Appointments' }
        await notifyGroupPurchase({
          name: pBuyer?.name || null, email: pBuyer?.email || null,
          description: `Pacote de ${quantity} ${labelMap[productType] || productType}`,
          amount: (session.amount_total || 0) / 100, kind: 'pacote',
        })
      } catch (e) { console.error('[Stripe Webhook] aviso compra grupo:', (e as any)?.message) }

      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const buyerId = sub.metadata?.buyer_id
      const interval = (sub.metadata?.interval as 'month' | 'year') || 'month'
      if (buyerId) {
        const status = sub.status === 'active' || sub.status === 'trialing' ? 'active' : 'inactive'
        const expiresAt = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null
        await supabase.from('buyers').update({
          crm_plan: status === 'active' ? 'pro' : 'free',
          crm_subscription_id: sub.id,
          crm_subscription_status: status,
          crm_billing_interval: interval,
          crm_expires_at: expiresAt,
        }).eq('id', buyerId)
        console.log(`[Stripe Webhook] CRM subscription ${status} (${interval}) for ${buyerId}`)

        // Trigger referral reward on first subscription
        if (status === 'active' && event.type === 'customer.subscription.created') {
          const { data: buyer } = await supabase.from('buyers').select('referred_by').eq('id', buyerId).single()
          if (buyer?.referred_by) {
            const rewardCents = interval === 'year' ? 10000 : 2500
            await supabase.from('referral_rewards').insert({
              referrer_buyer_id: buyer.referred_by,
              referred_buyer_id: buyerId,
              trigger_event: 'crm_subscription',
              reward_cents: rewardCents,
            }).select().maybeSingle()
            // Increment referrer credit (idempotent via UNIQUE)
            const { error } = await supabase.rpc('increment_referral_credit', { p_buyer_id: buyer.referred_by, p_cents: rewardCents })
            if (error) {
              // Fallback: manual update
              const { data: referrer } = await supabase.from('buyers').select('referral_credit_cents').eq('id', buyer.referred_by).single()
              await supabase.from('buyers').update({ referral_credit_cents: (referrer?.referral_credit_cents || 0) + rewardCents }).eq('id', buyer.referred_by)
            }
          }
        }
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const buyerId = sub.metadata?.buyer_id
      if (buyerId) {
        // Só zera a conta se a sub deletada ainda for a ATUAL do buyer — evita marcar como
        // cancelado quando um UPGRADE cancela a sub antiga e o buyer já migrou pra uma nova.
        const { data: b } = await supabase.from('buyers').select('crm_subscription_id').eq('id', buyerId).single()
        if (b?.crm_subscription_id && b.crm_subscription_id !== sub.id) {
          console.log(`[Stripe Webhook] delete da sub antiga ${sub.id} ignorado; buyer já em ${b.crm_subscription_id}`)
          break
        }
        await supabase.from('buyers').update({
          crm_plan: 'free',
          crm_subscription_status: 'cancelled',
        }).eq('id', buyerId)
        console.log(`[Stripe Webhook] CRM subscription cancelled for ${buyerId}`)
      }
      break
    }

    case 'invoice.payment_succeeded': {
      // Cobranca da ASSINATURA do CRM — grava como payment (type 'crm') pra entrar na receita.
      const invoice = event.data.object as any
      const subId = invoice.subscription || invoice.parent?.subscription_details?.subscription || invoice.lines?.data?.[0]?.subscription || null
      const amount = (invoice.amount_paid || 0) / 100
      if (subId && amount > 0) {
        const { data: dupe } = await supabase.from('payments').select('id').eq('stripe_session_id', invoice.id).maybeSingle()
        if (dupe) { console.log(`[Stripe Webhook] invoice CRM ja registrada: ${invoice.id}`); break }
        let { data: subBuyer } = await supabase.from('buyers').select('id, name, email').eq('crm_subscription_id', subId).maybeSingle()
        if (!subBuyer) {
          // 🩹 CORRIDA (Zimmer 21/07, Rita 27/07): a fatura pode chegar ANTES do
          // customer.subscription.created gravar o sub id no buyer → antes isso
          // descartava pagamento+aviso em silêncio. Fallback: busca a assinatura no
          // Stripe e resolve o buyer pelo metadata.buyer_id (o checkout SEMPRE grava
          // via subscription_data). De quebra, já grava o sub id no buyer (cura a ordem).
          try {
            const sub = await getStripe().subscriptions.retrieve(subId)
            const bid = (sub.metadata as any)?.buyer_id
            if (bid) {
              const { data: byMeta } = await supabase.from('buyers').select('id, name, email').eq('id', bid).maybeSingle()
              if (byMeta) {
                subBuyer = byMeta
                await supabase.from('buyers').update({ crm_subscription_id: subId }).eq('id', bid).is('crm_subscription_id', null)
                console.log(`[Stripe Webhook] invoice CRM: buyer resolvido via metadata da sub (${bid}) — corrida contornada`)
              }
            }
          } catch (e: any) { console.error('[Stripe Webhook] fallback metadata da sub falhou:', e?.message) }
        }
        if (!subBuyer) { console.error(`[Stripe Webhook] invoice CRM sem buyer (sub ${subId})`); break }
        const { error: crmPayErr } = await supabase.from('payments').insert({
          buyer_id: subBuyer.id,
          stripe_session_id: invoice.id,
          stripe_payment_intent_id: invoice.payment_intent || null,
          amount,
          product_type: 'crm',
          quantity: 1,
          price_per_unit: amount,
          status: 'completed',
        })
        if (crmPayErr) console.error('[Stripe Webhook] falha ao gravar payment CRM:', crmPayErr)
        else console.log(`[Stripe Webhook] CRM payment $${amount} -> buyer ${subBuyer.id} (invoice ${invoice.id})`)

        // 🎁 BONUS DE LEADS do plano CRM: 5/mes * meses do ciclo, creditado a CADA cobranca
        // (inicial + renovacoes). Idempotente por invoice. Meses = recurring da linha da invoice.
        const bonusLine = invoice.lines?.data?.[0]
        const rec = bonusLine?.price?.recurring || bonusLine?.plan || null
        const recMonths = rec ? (rec.interval === 'year' ? 12 * (rec.interval_count || 1) : (rec.interval_count || 1)) : 0
        // Plano pelo VALOR cobrado (robusto: a linha da fatura as vezes vem sem recurring/interval_count → caia em 0/Mensal e bônus errado).
        const crmPlan = CRM_PLAN_LIST.find(p => p.amountCents === Math.round(amount * 100)) || null
        const monthsInCycle = crmPlan ? crmPlan.months : recMonths
        // DRIP: credita SÓ o mês 1 (5 leads) aqui; o cron dripCrmBonusLeads pinga +5 a cada 30 dias até o total do plano (trimestral/semestral/anual).
        // 🛑 BÔNUS DESCONTINUADO pra assinatura NOVA (decisão 2026-07-23): só continua
        // recebendo quem JÁ tem histórico de bônus (assinante antigo = direito adquirido,
        // renovações incluídas). Assinante novo nunca ganha o m1 → o drip pula sozinho
        // (exige m1 do ciclo). A oferta saiu das telas de venda no mesmo commit.
        const { data: grandfathered } = await supabase
          .from('credits').select('id')
          .eq('buyer_id', subBuyer.id).like('stripe_payment_id', 'crm-bonus:%')
          .limit(1).maybeSingle()
        const bonusLeads = grandfathered ? LEADS_PER_MONTH : 0
        if (bonusLeads > 0) {
          const leadMarker = `crm-bonus:${invoice.id}:m1`
          const { data: dupLead } = await supabase.from('credits').select('id').eq('stripe_payment_id', leadMarker).maybeSingle()
          if (!dupLead) {
            const { error: bonusErr } = await supabase.from('credits').insert({
              buyer_id: subBuyer.id, type: 'lead', total_purchased: bonusLeads, total_used: 0,
              price_per_unit: 0, stripe_payment_id: leadMarker, purchased_at: new Date().toISOString(),
            })
            if (bonusErr) console.error('[Stripe Webhook] falha bonus leads CRM:', bonusErr)
            else console.log(`[Stripe Webhook] CRM bonus ${bonusLeads} leads (${monthsInCycle}m) -> buyer ${subBuyer.id}`)
          }
        }

        // 🔔 Avisa o grupo de controle sobre a assinatura/renovacao (nome, email, plano, valor)
        try {
          const planLabel = crmPlan ? crmPlan.label : (monthsInCycle === 12 ? 'Anual' : monthsInCycle === 6 ? 'Semestral' : monthsInCycle === 3 ? 'Trimestral' : 'Mensal')
          await notifyGroupPurchase({
            name: (subBuyer as any).name || null, email: (subBuyer as any).email || null,
            description: `Assinatura CRM Pro — ${planLabel}`,
            amount, kind: invoice.billing_reason === 'subscription_cycle' ? 'renovacao' : 'assinatura',
          })
        } catch (e) { console.error('[Stripe Webhook] aviso assinatura grupo:', (e as any)?.message) }
      }
      break
    }

    case 'charge.refunded': {
      // Reembolso na Stripe → marca o pagamento como 'refunded' no nosso banco.
      // A receita (/admin/revenue) só soma status='completed', então isso já desconta.
      const charge = event.data.object as any
      const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : null
      if (pi) {
        const { error: refErr } = await supabase.from('payments').update({ status: 'refunded' }).eq('stripe_payment_intent_id', pi)
        if (refErr) console.error('[Stripe Webhook] falha ao marcar refunded:', refErr)
        else console.log(`[Stripe Webhook] pagamento marcado REFUNDED (PI ${pi})`)
      }
      break
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      console.log(`[Stripe Webhook] Payment failed: ${paymentIntent.id}`)
      break
    }

    default:
      console.log(`[Stripe Webhook] Unhandled event: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}
