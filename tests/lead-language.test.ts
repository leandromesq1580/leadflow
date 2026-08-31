import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind } from 'typescript'
import { isLeadLanguage, leadLanguageForLead, purchaseLeadLanguage, leadLanguageLabel } from '../src/lib/lead-language'
import { buildPurchaseHistory } from '../src/lib/purchase-history'
import * as languages from '../src/lib/lead-language'

test('product language is explicit; legacy purchases remain BR; unknown Meta forms are not guessed', () => {
  for (const value of [undefined, null, '', 'en', 'BR', 'Spanish']) assert.equal(isLeadLanguage(value), false)
  assert.equal(isLeadLanguage('pt'), true)
  assert.equal(isLeadLanguage('es'), true)
  assert.equal(purchaseLeadLanguage(undefined), 'pt')
  assert.equal(purchaseLeadLanguage('es'), 'es')
  assert.equal(purchaseLeadLanguage('en'), null)
  assert.equal(leadLanguageForLead({ form_name: '1963007337624994', lead_language: 'pt' }), 'es')
  assert.equal(leadLanguageForLead({ form_name: '25952858404333766' }), 'pt')
  assert.equal(leadLanguageForLead({ meta_lead_id: 'unknown', lead_language: null }), null)
  assert.equal(leadLanguageForLead({}), 'pt')
  assert.match(leadLanguageLabel('es'), /espanhol/)
})

test('purchase history keeps BR/Spanish and CRM separate, without duplicate credit rows', () => {
  const history = buildPurchaseHistory([
    { id: 'p1', amount: 280, product_type: 'lead', quantity: 10, price_per_unit: 28, status: 'completed', created_at: '2026-08-31', stripe_payment_intent_id: 'pi_es', lead_language: 'es' },
    { id: 'p2', amount: 100, product_type: 'cold_lead', quantity: 25, price_per_unit: 4, status: 'completed', created_at: '2026-08-30', lead_language: 'es' },
    { id: 'p3', amount: 99, product_type: 'crm', quantity: 1, price_per_unit: 99, status: 'completed', created_at: '2026-08-29', lead_language: 'pt' },
  ], [
    { id: 'c1', type: 'lead', total_purchased: 10, total_used: 2, price_per_unit: 28, purchased_at: '2026-08-31', stripe_payment_id: 'pi_es', lead_language: 'es' },
    { id: 'legacy', type: 'lead', total_purchased: 5, total_used: 1, price_per_unit: 0, purchased_at: '2026-08-01', stripe_payment_id: 'manual:test' },
  ])
  assert.equal(history.length, 4)
  assert.equal(history[0].leadLanguage, 'es')
  assert.equal(history[0].remaining, 8)
  assert.equal(history[1].leadLanguage, 'es')
  assert.equal(history[2].leadLanguage, null)
  assert.equal(history[3].leadLanguage, 'pt')
})

// Execute the real route with in-memory service doubles. No Stripe/Supabase
// credentials, live checkouts, emails, or WhatsApp sends are used by these tests.
function route(path: string, dependencies: Record<string, unknown>): { POST: (req: Request) => Promise<Response> } {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', js)((name: string) => {
    if (name === 'next/server') return { NextResponse: Response }
    if (name === '@/lib/lead-language') return languages
    if (name in dependencies) return dependencies[name]
    throw new Error(`Unexpected dependency: ${name}`)
  }, module, module.exports)
  return module.exports as ReturnType<typeof route>
}

function chain(data: unknown = { id: 'buyer', name: 'Test', email: 'test@example.invalid' }) {
  const result = { data, error: null }
  return new Proxy({}, { get: (_target, name) => name === 'then'
    ? (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
    : () => chain(data) })
}

test('checkout rejects missing/invalid language and sends selected language to Stripe', async () => {
  const sessions: any[] = []
  const { POST } = route('app/api/checkout/route.ts', {
    '@/lib/stripe': {
      PRODUCTS: { lead: { name: 'Lead Exclusivo', packages: [{ id: 'lead_10', quantity: 10, unitPriceCents: 2800, pricePerUnit: 28 }] }, cold_lead: { name: 'Lead Frio', packages: [{ id: 'cold_25', quantity: 25, unitPriceCents: 400, pricePerUnit: 4 }] } },
      getStripe: () => ({ checkout: { sessions: { create: async (params: any) => { sessions.push(params); return { url: 'https://checkout.example.invalid/test' } } } } }),
    },
    '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => chain() }) },
    '@/lib/coupons': { resolveCoupon: () => null },
    '@/lib/policies': { hasAcceptedCurrentPolicy: async () => true },
    '@/lib/referral': { discountForOrder: async () => 0 },
    '@/lib/sales-team-pricing': {
      NO_TEAM_PRICING: { is_member: false, lead_unit_price_cents: 2100 },
      readSalesTeamPricing: async () => ({ is_member: false, lead_unit_price_cents: 2100 }),
      purchaseUnitPrice: (_type: string, cents: number) => ({ unitPriceCents: cents, source: 'catalog', couponCode: '' }),
    },
  })
  const request = (body: unknown) => new Request('http://localhost/api/checkout', { method: 'POST', body: JSON.stringify(body) })
  for (const leadLanguage of [undefined, null, '', 'en']) {
    const res = await POST(request({ packageId: 'lead_10', leadLanguage }))
    assert.equal(res.status, 400)
    assert.equal((await res.json()).code, 'LEAD_LANGUAGE_REQUIRED')
  }
  assert.equal(sessions.length, 0)
  for (const leadLanguage of ['pt', 'es']) {
    for (const packageId of ['lead_10', 'cold_25']) {
      assert.equal((await POST(request({ packageId, leadLanguage }))).status, 200)
      const params = sessions.at(-1)
      assert.equal(params.metadata.lead_language, leadLanguage)
      assert.equal(params.payment_intent_data.metadata.lead_language, leadLanguage)
      assert.ok(params.line_items[0].price_data.product_data.name.includes(leadLanguageLabel(leadLanguage as 'pt' | 'es')))
      assert.equal(params.line_items[0].price_data.unit_amount, packageId === 'lead_10' ? 2800 : 400)
    }
  }
})

test('paid webhook uses atomic fulfillment, legacy BR, retries on error, and ignores unpaid/duplicates', async () => {
  let event: any
  let fail = false
  let duplicate = false
  const calls: any[] = []
  const notices: any[] = []
  const { POST } = route('app/api/webhook/stripe/route.ts', {
    '@/lib/stripe': { getStripe: () => ({ webhooks: { constructEvent: () => event } }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => chain(), rpc: async (name: string, params: any) => { calls.push({ name, params }); return { data: !duplicate, error: fail ? { message: 'test failure' } : null } } }) },
    '@/lib/crm-plans': { LEADS_PER_MONTH: 5, CRM_PLAN_LIST: [] },
    '@/lib/notifications': { notifyGroupPurchase: async (notice: any) => { notices.push(notice) } },
    '@/lib/referral': { grantReferralReward: async () => {}, cancelRewardsFor: async () => {}, consumeCredit: async () => {} },
  })
  const session = (language: string | undefined = 'es') => ({ id: 'cs_test', payment_status: 'paid', payment_intent: 'pi_test', amount_total: 28000, metadata: { buyer_id: 'buyer', product_type: 'lead', quantity: '10', price_per_unit: '28', lead_language: language } })
  const send = () => POST(new Request('http://localhost/api/webhook/stripe', { method: 'POST', headers: { 'stripe-signature': 'test' }, body: '{}' }))
  event = { type: 'checkout.session.completed', data: { object: session() } }
  assert.equal((await send()).status, 200)
  assert.equal(calls.at(-1).name, 'fulfill_lead_purchase')
  assert.equal(calls.at(-1).params.p_language, 'es')
  assert.match(notices[0].description, /espanhol/)
  duplicate = true
  await send()
  assert.equal(notices.length, 1)
  duplicate = false
  event.data.object.payment_status = 'unpaid'
  const previous = calls.length
  await send()
  assert.equal(calls.length, previous)
  event = { type: 'checkout.session.async_payment_succeeded', data: { object: session() } }
  fail = true
  assert.equal((await send()).status, 500)
  fail = false
  event.data.object = session()
  delete event.data.object.metadata.lead_language
  await send()
  assert.equal(calls.at(-1).params.p_language, 'pt')
  event.data.object = session('en')
  assert.equal((await send()).status, 500)
})
