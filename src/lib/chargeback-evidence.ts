import Stripe from 'stripe'
import type { createAdminClient } from './supabase/admin'
import { notifyAdmins } from './notifications'
import { getStripe } from './stripe'

type Db = ReturnType<typeof createAdminClient>

function stripeId(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  return null
}

/**
 * Consolida o clickwrap da aplicacao com o checkbox nativo da Stripe. O registro
 * nasce somente depois de um Checkout pago e e idempotente pelo ID da sessao.
 */
export async function recordCompletedPurchaseConsent(db: Db, session: Stripe.Checkout.Session) {
  const buyerId = session.metadata?.buyer_id
  const policyVersion = session.metadata?.policy_version
  const policySha256 = session.metadata?.policy_sha256
  if (!buyerId || !policyVersion || !policySha256) return

  const acceptanceId = session.metadata?.policy_acceptance_id || null
  const { data: acceptance } = acceptanceId
    ? await db.from('policy_acceptances').select('id, ip, user_agent, accepted_at').eq('id', acceptanceId).maybeSingle()
    : await db.from('policy_acceptances').select('id, ip, user_agent, accepted_at')
      .eq('buyer_id', buyerId).eq('version', policyVersion).maybeSingle()

  const raw = session as Stripe.Checkout.Session & { consent?: { terms_of_service?: string | null } | null }
  const termsAccepted = raw.consent?.terms_of_service === 'accepted'
  const { error } = await db.from('purchase_consents').insert({
    buyer_id: buyerId,
    policy_acceptance_id: acceptance?.id || acceptanceId,
    policy_version: policyVersion,
    policy_sha256: policySha256,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: stripeId(session.payment_intent),
    stripe_subscription_id: stripeId(session.subscription),
    product_type: session.metadata?.product_type || (session.metadata?.addon ? `addon_${session.metadata.addon}` : session.mode),
    product_description: session.metadata?.product_description || null,
    quantity: Number(session.metadata?.quantity || 1),
    lead_language: session.metadata?.lead_language || null,
    amount_cents: session.amount_total || 0,
    currency: session.currency || 'usd',
    locale: session.metadata?.policy_locale || null,
    stripe_terms_accepted: termsAccepted,
    acceptance_ip: acceptance?.ip || null,
    acceptance_user_agent: acceptance?.user_agent || null,
    accepted_at: acceptance?.accepted_at || session.metadata?.policy_accepted_at || null,
    checkout_completed_at: new Date().toISOString(),
  })
  if (error && !/duplicate|unique/i.test(error.message)) throw error
}

/** Guarda toda mudanca de disputa e avisa o administrador sem enviar evidencia. */
export async function recordStripeDispute(db: Db, event: Stripe.Event, dispute: Stripe.Dispute) {
  const raw = dispute as Stripe.Dispute & { payment_intent?: unknown }
  let paymentIntentId = stripeId(raw.payment_intent)
  const chargeId = stripeId(dispute.charge)
  if (!paymentIntentId && chargeId) {
    try {
      const charge = await getStripe().charges.retrieve(chargeId)
      paymentIntentId = stripeId(charge.payment_intent)
    } catch (error) {
      console.error('[Chargeback] failed to retrieve disputed charge:', error)
    }
  }

  let payment: { id: string; buyer_id: string } | null = null
  if (paymentIntentId) {
    const result = await db.from('payments').select('id, buyer_id')
      .eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
    payment = result.data
  }

  let buyerId = payment?.buyer_id || null
  if (!buyerId && paymentIntentId) {
    const { data: consent } = await db.from('purchase_consents').select('buyer_id')
      .eq('stripe_payment_intent_id', paymentIntentId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    buyerId = consent?.buyer_id || null
  }
  if (!buyerId && paymentIntentId) {
    try {
      const intent = await getStripe().paymentIntents.retrieve(paymentIntentId)
      buyerId = intent.metadata?.buyer_id || null
    } catch (error) {
      console.error('[Chargeback] failed to resolve buyer from PaymentIntent:', error)
    }
  }

  const dueBy = dispute.evidence_details?.due_by
    ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
    : null
  const caseRow = {
    stripe_dispute_id: dispute.id,
    stripe_charge_id: chargeId,
    stripe_payment_intent_id: paymentIntentId,
    buyer_id: buyerId,
    payment_id: payment?.id || null,
    reason: dispute.reason || null,
    status: dispute.status,
    amount_cents: dispute.amount,
    currency: dispute.currency,
    evidence_due_by: dueBy,
    evidence_details: dispute.evidence_details || {},
    updated_at: new Date().toISOString(),
  }
  const { data: saved, error } = await db.from('chargeback_cases')
    .upsert(caseRow, { onConflict: 'stripe_dispute_id' }).select('id').single()
  if (error) throw error

  const { error: eventError } = await db.from('chargeback_events').insert({
    chargeback_case_id: saved.id,
    stripe_event_id: event.id,
    event_type: event.type,
    status: dispute.status,
    payload: {
      reason: dispute.reason,
      amount: dispute.amount,
      currency: dispute.currency,
      evidence_due_by: dueBy,
      is_charge_refundable: dispute.is_charge_refundable,
    },
    occurred_at: new Date(event.created * 1000).toISOString(),
  })
  if (eventError && !/duplicate|unique/i.test(eventError.message)) throw eventError

  if (event.type === 'charge.dispute.created') {
    const amount = (dispute.amount / 100).toLocaleString('en-US', { style: 'currency', currency: dispute.currency.toUpperCase() })
    await notifyAdmins(`🚨 *CHARGEBACK ABERTO*\n💵 ${amount}\n📋 Motivo: ${dispute.reason || 'não informado'}\n⏳ Prazo: ${dueBy || 'consultar Stripe'}\n🔎 Caso: ${dispute.id}\n\nAbra Admin → Chargebacks antes de enviar a resposta.`)
  }
}
