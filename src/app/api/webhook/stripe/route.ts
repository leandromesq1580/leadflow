import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { CRM_PLAN_LIST } from '@/lib/crm-plans'
import { notifyGroupPurchase } from '@/lib/notifications'
import { grantReferralReward, cancelRewardsFor, consumeCredit } from '@/lib/referral'
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

      // Add-ons (apólices, IA na ligação…): a concessão acontece no
      // customer.subscription.created (marca metadata.addon) — aqui não há crédito.
      if (session.metadata?.addon) {
        console.log(`[Stripe Webhook] checkout do add-on ${session.metadata.addon} concluído para ${session.metadata?.buyer_id}`)
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

      // 🎁 INDICAÇÃO na compra de pacote de leads (5% — regra 2026-07-30)
      try { await grantReferralReward(supabase, buyerId, 'lead', session.amount_total || 0) }
      catch (e) { console.error('[Stripe Webhook] indicação leads:', (e as any)?.message) }

      // 💳 Se o checkout usou crédito de indicação como desconto, debita agora (confirmado)
      const usouCredito = parseInt(session.metadata?.referral_discount_cents || '0', 10) || 0
      if (usouCredito > 0) {
        try { await consumeCredit(supabase, buyerId, usouCredito, session.id) }
        catch (e) { console.error('[Stripe Webhook] consumo de crédito:', (e as any)?.message) }
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

      // ⚠️ ADD-ONS (apólices $39, ia_ligacao $49): NÃO são assinatura de CRM — sem esta
      // saída, o bloco abaixo ligaria crm_plan='pro' pra quem só pagou o add-on e
      // trocaria o crm_subscription_id do buyer. Aqui só liga/desliga em settings
      // (`<addon>_addon` = { buyerId: {active, sub_id, status} }).
      if (sub.metadata?.addon && ['apolices', 'ia_ligacao'].includes(sub.metadata.addon)) {
        if (buyerId) {
          const chaveAddon = `${sub.metadata.addon}_addon`
          const ativo = sub.status === 'active' || sub.status === 'trialing'
          const { data: cur } = await supabase.from('settings').select('value').eq('key', chaveAddon).maybeSingle()
          const mapa = ((cur?.value as Record<string, any>) || {})
          mapa[buyerId] = { active: ativo, sub_id: sub.id, status: sub.status, updated_at: new Date().toISOString() }
          await supabase.from('settings').upsert(
            { key: chaveAddon, value: mapa, updated_at: new Date().toISOString() }, { onConflict: 'key' },
          )
          console.log(`[Stripe Webhook] add-on ${sub.metadata.addon} ${ativo ? 'ATIVO' : `inativo (${sub.status})`} para ${buyerId}`)
        }
        break
      }

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

        // ⚖️ UMA ASSINATURA POR CLIENTE (regra do dono; caso Roberta, 2026-08-10).
        // A renovação falha, o cliente ASSINA DE NOVO em vez de trocar o cartão, e a
        // antiga fica viva em past_due — o retry cobraria $99 extra no dia em que o
        // cartão voltasse a aceitar. Ao NASCER uma assinatura, toda outra assinatura
        // viva do mesmo cliente Stripe é cancelada e a fatura pendente dela anulada.
        if (event.type === 'customer.subscription.created' && typeof sub.customer === 'string') {
          try {
            const stripe = getStripe()
            const outras = await stripe.subscriptions.list({ customer: sub.customer, limit: 20 })
            for (const velha of outras.data) {
              if (velha.id === sub.id) continue
              // add-on convive com o CRM — não é duplicata, não cancela
              if (velha.metadata?.addon) continue
              if (!['active', 'past_due', 'unpaid', 'trialing'].includes(velha.status)) continue
              await stripe.subscriptions.cancel(velha.id)
              console.log(`[Stripe Webhook] 1-por-cliente: duplicada ${velha.id} (${velha.status}) cancelada em favor de ${sub.id}`)
              if (typeof velha.latest_invoice === 'string') {
                try {
                  const inv = await stripe.invoices.retrieve(velha.latest_invoice)
                  if (inv.status === 'open') await stripe.invoices.voidInvoice(inv.id)
                } catch (e: any) { console.error('[Stripe Webhook] anular fatura da duplicada falhou:', e?.message) }
              }
            }
          } catch (e: any) { console.error('[Stripe Webhook] varredura 1-por-cliente falhou:', e?.message) }
        }

        // 🎁 INDICAÇÃO (regra 2026-07-30): a recompensa vem do VALOR pago (tabela em
        // lib/referral), fica PENDENTE 14 dias e é 1 por indicado. A concessão real
        // acontece na fatura (invoice.payment_succeeded), que é onde temos o valor
        // cobrado — aqui não fazemos nada pra não pagar por assinatura que não cobrou.
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const buyerId = sub.metadata?.buyer_id

      // Add-on cancelado → só desliga o acesso daquele add-on; CRM intacto.
      if (sub.metadata?.addon && ['apolices', 'ia_ligacao'].includes(sub.metadata.addon)) {
        if (buyerId) {
          const chaveAddon = `${sub.metadata.addon}_addon`
          const { data: cur } = await supabase.from('settings').select('value').eq('key', chaveAddon).maybeSingle()
          const mapa = ((cur?.value as Record<string, any>) || {})
          mapa[buyerId] = { ...(mapa[buyerId] || {}), active: false, status: 'cancelled', updated_at: new Date().toISOString() }
          await supabase.from('settings').upsert(
            { key: chaveAddon, value: mapa, updated_at: new Date().toISOString() }, { onConflict: 'key' },
          )
          console.log(`[Stripe Webhook] add-on ${sub.metadata.addon} CANCELADO para ${buyerId}`)
        }
        break
      }

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

        // Identifica o plano somente para o aviso financeiro. Assinatura CRM não
        // cria crédito de lead: nem compra nova, nem re-assinatura, nem renovação.
        const bonusLine = invoice.lines?.data?.[0]
        const rec = bonusLine?.price?.recurring || bonusLine?.plan || null
        const recMonths = rec ? (rec.interval === 'year' ? 12 * (rec.interval_count || 1) : (rec.interval_count || 1)) : 0
        // Plano pelo VALOR cobrado (robusto: a linha da fatura as vezes vem sem recurring/interval_count → caia em 0/Mensal e bônus errado).
        const crmPlan = CRM_PLAN_LIST.find(p => p.amountCents === Math.round(amount * 100)) || null
        const monthsInCycle = crmPlan ? crmPlan.months : recMonths
        // 🎁 INDICAÇÃO: só na PRIMEIRA cobrança do indicado (renovação não paga de novo)
        if (invoice.billing_reason !== 'subscription_cycle') {
          try { await grantReferralReward(supabase, subBuyer.id, 'crm', Math.round(amount * 100)) }
          catch (e) { console.error('[Stripe Webhook] indicação CRM:', (e as any)?.message) }
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
      // 🎁 INDICAÇÃO: reembolso do indicado estorna a recompensa do indicador
      try {
        const ch = event.data.object as any
        const pi = ch.payment_intent
        if (pi) {
          const { data: pay } = await supabase.from('payments').select('buyer_id').eq('stripe_payment_intent_id', pi).maybeSingle()
          if (pay?.buyer_id) await cancelRewardsFor(supabase, pay.buyer_id, 'reembolso do indicado')
        }
      } catch (e) { console.error('[Stripe Webhook] estorno indicação:', (e as any)?.message) }
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
