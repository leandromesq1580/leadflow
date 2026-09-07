import Stripe from 'stripe'

const secret = process.env.STRIPE_SECRET_KEY || ''
if (!secret.startsWith('sk_live_') && !secret.startsWith('rk_live_')) {
  throw new Error(`Refusing to configure Stripe key type ${secret.slice(0, 8) || 'missing'} (length ${secret.length})`)
}

const stripe = new Stripe(secret)
const accountId = 'acct_1S3crPRdCjUR96oH'
const policyUrl = 'https://lead4producers.com/politicas'
const privacyUrl = 'https://lead4producers.com/privacy'

let publicDetails = 'configured'
try {
  await stripe.accounts.update(accountId, {
    business_profile: {
      terms_of_service_url: policyUrl,
      privacy_policy_url: privacyUrl,
    },
  })
} catch (error) {
  if (error?.code !== 'more_permissions_required' && !/cannot use this method|permission/i.test(error?.message || '')) throw error
  publicDetails = 'restricted_key_cannot_update'
}

const disputeEvents = [
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
]
let webhookStatus = 'configured'
let targetCount = 0
try {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
  const targets = endpoints.data.filter(endpoint => endpoint.url.includes('lead4producers.com/api/webhook/stripe'))
  targetCount = targets.length
  if (targets.length === 0) throw new Error('Production Stripe webhook endpoint was not found')
  for (const endpoint of targets) {
    if (endpoint.enabled_events.includes('*')) continue
    const enabled_events = [...new Set([...endpoint.enabled_events, ...disputeEvents])]
    await stripe.webhookEndpoints.update(endpoint.id, { enabled_events })
  }
} catch (error) {
  if (error?.code !== 'more_permissions_required' && !/cannot use this method|permission/i.test(error?.message || '')) throw error
  webhookStatus = 'restricted_key_cannot_update'
}

// Verifica sem cobrar nem criar cliente se o checkbox de termos pode ser usado.
// A Stripe recusa a criacao caso a URL publica dos termos esteja ausente.
let termsReady = false
let verificationSession = null
try {
  verificationSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price_data: { currency: 'usd', unit_amount: 0, product_data: { name: 'Lead4Pro terms verification' } }, quantity: 1 }],
    consent_collection: { terms_of_service: 'required' },
    success_url: 'https://lead4producers.com/politicas?stripe=verified',
    cancel_url: 'https://lead4producers.com/politicas',
  })
  termsReady = true
} catch (error) {
  if (!/terms of service|terms_of_service|business profile/i.test(error?.message || '')) throw error
}
if (verificationSession?.status === 'open') {
  try { await stripe.checkout.sessions.expire(verificationSession.id) } catch {}
}

console.log(JSON.stringify({
  mode: 'live',
  account: `${accountId.slice(0, 8)}...`,
  terms_of_service_url: policyUrl,
  public_details: publicDetails,
  terms_checkbox_ready: termsReady,
  webhook_status: webhookStatus,
  webhook_endpoints_updated: targetCount,
  dispute_events: disputeEvents,
}))
