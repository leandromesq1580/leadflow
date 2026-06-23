import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributeColdLeads } from '@/lib/cold-leads'
import { LEADS_PER_MONTH } from '@/lib/crm-plans'
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

      const buyerId = session.metadata?.buyer_id
      const productType = session.metadata?.product_type as 'lead' | 'appointment'
      const quantity = parseInt(session.metadata?.quantity || '0', 10)
      const pricePerUnit = parseFloat(session.metadata?.price_per_unit || '0')

      if (!buyerId || !productType || !quantity) {
        console.error('[Stripe Webhook] Missing metadata:', session.metadata)
        break
      }

      console.log(`[Stripe Webhook] Payment completed: ${quantity} ${productType}s for buyer ${buyerId}`)

      // Create credits for buyer
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

      // If cold_lead purchase, distribute cold leads immediately
      if (productType === 'cold_lead') {
        const distributed = await distributeColdLeads(buyerId, quantity)
        console.log(`[Stripe Webhook] Distributed ${distributed} cold leads to ${buyerId}`)

        // Update credits used count
        if (distributed > 0) {
          const { data: newCredit } = await supabase
            .from('credits')
            .select('id')
            .eq('buyer_id', buyerId)
            .eq('type', 'cold_lead')
            .order('purchased_at', { ascending: false })
            .limit(1)
            .single()

          if (newCredit) {
            await supabase.from('credits').update({ total_used: distributed }).eq('id', newCredit.id)
          }
        }
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
        const { data: subBuyer } = await supabase.from('buyers').select('id, name, email').eq('crm_subscription_id', subId).maybeSingle()
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
        const monthsInCycle = rec ? (rec.interval === 'year' ? 12 * (rec.interval_count || 1) : (rec.interval_count || 1)) : 0
        const bonusLeads = LEADS_PER_MONTH * monthsInCycle
        if (bonusLeads > 0) {
          const leadMarker = `crm-bonus:${invoice.id}`
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
          const planLabel = monthsInCycle === 12 ? 'Anual' : monthsInCycle === 6 ? 'Semestral' : monthsInCycle === 3 ? 'Trimestral' : 'Mensal'
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
