const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(relative, mocks = {}, globals = {}) {
  const filename = path.join(__dirname, '..', relative)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, Response,
    console: { ...console, error() {} },
    require: name => name in mocks ? mocks[name] : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`, mocks) : require(name),
    ...globals,
  }, { filename })
  return module.exports
}
const pricing = load('src/lib/sales-team-pricing.ts')
const { purchaseUnitPrice: quote, readSalesTeamPricing: read, NO_TEAM_PRICING, validTeamPrice } = pricing
const { PRODUCTS } = load('src/lib/stripe.ts', { stripe: class Stripe {} })
const team = { is_member: true, lead_unit_price_cents: 2100 }
const buyerId = '11111111-1111-4111-8111-111111111111'
const actorId = '22222222-2222-4222-8222-222222222222'
test('team exclusive lead totals are $210, $525 and $1050; revocation restores each catalog tier', () => {
  assert.deepEqual(Array.from(PRODUCTS.lead.packages, p => quote('lead', p.unitPriceCents, team).unitPriceCents * p.quantity), [21000, 52500, 105000])
  for (const p of PRODUCTS.lead.packages) {
    assert.equal(quote('lead', p.unitPriceCents, NO_TEAM_PRICING).unitPriceCents, p.unitPriceCents)
    assert.equal(quote('lead', p.unitPriceCents, { ...team, is_member: false }).source, 'catalog')
    assert.equal(quote('lead', p.unitPriceCents, { ...team, lead_unit_price_cents: 2150 }).unitPriceCents, 2150)
  }
})
test('team benefit never changes cold leads, CRM or appointment pricing', () => {
  for (const type of ['cold_lead', 'crm', 'appointment']) {
    for (const cents of [300, 400, 9900]) {
      assert.equal(quote(type, cents, team, { code: 'test', unitPriceCents: 50 }).unitPriceCents, cents)
      assert.equal(quote(type, cents, team).source, 'catalog')
    }
  }
})
test('valid coupon and team price do not stack: only the lower exclusive lead price wins', () => {
  for (const [cents, expected, source] of [[2200, 2100, 'sales_team'], [2100, 2100, 'sales_team'], [2000, 2000, 'coupon']]) {
    const result = quote('lead', 2800, team, { code: 'VALID', unitPriceCents: cents })
    assert.equal(result.unitPriceCents, expected); assert.equal(result.source, source)
    assert.equal(result.couponCode, source === 'coupon' ? 'VALID' : '')
  }
  assert.equal(quote('lead', 2800, NO_TEAM_PRICING, { code: 'VALID', unitPriceCents: 2200 }).unitPriceCents, 2200)
})
test('prices require integral cents within the supported range', () => {
  for (const value of [undefined, null, '2100', 0, -2100, 49, 2100.1, NaN, Infinity, 100001]) assert.equal(validTeamPrice(value), false)
  for (const value of [50, 2100, 2150, 100000]) assert.equal(validTeamPrice(value), true)
})

function dbMock({ pricingData = team, pricingError = null, buyer = { id: buyerId, email: 'fictional@example.com', name: 'Test', stripe_customer_id: null }, buyerError = null, writeError = null } = {}) {
  const operations = []
  return { operations, from(table) {
    const op = { table, filters: [] }; operations.push(op)
    const result = () => table === 'buyers' ? { data: buyer, error: buyerError }
      : { data: op.write ? { is_member: op.write.is_member, lead_unit_price_cents: op.write.lead_unit_price_cents } : pricingData, error: op.write ? writeError : pricingError }
    const query = {
      select(columns) { op.columns = columns; return query },
      eq(column, value) { op.filters.push([column, value]); return query },
      upsert(value, options) { op.write = value; op.options = options; return query },
      single: async () => result(), maybeSingle: async () => result(),
    }
    return query
  } }
}
test('missing membership defaults to normal customer, without creating a row', async () => {
  const db = dbMock({ pricingData: null }); const value = await read(db, buyerId)
  assert.equal(value.is_member, false); assert.equal(value.lead_unit_price_cents, 2100)
  assert.equal(db.operations[0].filters[0][1], buyerId)
  assert.equal(db.operations.some(o => o.write), false)
})
test('pricing database errors and malformed configuration never silently quote a different price', async () => {
  await assert.rejects(read(dbMock({ pricingError: { code: 'offline' } }), buyerId))
  await assert.rejects(read(dbMock({ pricingData: { is_member: true, lead_unit_price_cents: -5 } }), buyerId))
})

function checkout(options = {}) {
  const db = dbMock(options); const sessions = []; const discounts = []
  const { POST } = load('src/app/api/checkout/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: options.anonymous ? null : { id: 'session-user' } } }) } }) },
    '@/lib/policies': { hasAcceptedCurrentPolicy: async () => options.accepted !== false },
    '@/lib/referral': { discountForOrder: async (_db, id, cents) => { discounts.push({ id, cents }); return 0 } },
    '@/lib/stripe': { PRODUCTS, getStripe: () => ({ checkout: { sessions: { create: async params => { sessions.push(params); return { url: 'https://checkout.invalid/mock' } } } } }) },
  })
  return { db, sessions, discounts, invoke: body => POST({ json: async () => ({ leadLanguage: 'pt', ...body }) }) }
}
test('checkout charges trusted team price for all exclusive packages with correct payment metadata', async () => {
  for (const p of PRODUCTS.lead.packages) {
    const r = checkout(); assert.equal((await r.invoke({ packageId: p.id })).status, 200)
    const session = r.sessions[0]
    assert.equal(session.line_items[0].price_data.unit_amount, 2100)
    assert.equal(session.line_items[0].quantity, p.quantity)
    assert.equal(session.metadata.price_per_unit, '21')
    assert.equal(session.metadata.buyer_id, buyerId)
    assert.equal(session.metadata.price_source, 'sales_team')
    assert.equal(r.discounts[0].cents, 2100 * p.quantity)
  }
})
test('forged buyer, membership, custom price, coupon and staff fields cannot change checkout', async () => {
  const r = checkout({ pricingData: null })
  await r.invoke({ packageId: 'lead_10', buyer_id: actorId, is_member: true, lead_unit_price_cents: 1, unitPrice: 1, is_staff: true, couponCode: 'LEADZIMMER22' })
  assert.equal(r.sessions[0].line_items[0].price_data.unit_amount, 2800)
  assert.equal(r.sessions[0].metadata.price_source, 'catalog')
  assert.equal(r.sessions[0].metadata.buyer_id, buyerId)
  assert.equal(r.db.operations.find(o => o.table === 'buyers').filters[0][1], 'session-user')
  assert.equal(r.db.operations.find(o => o.table === 'sales_team_pricing').filters[0][1], buyerId)
  assert.ok(r.db.operations.every(o => !o.write))
})
test('cold checkout stays unchanged and does not depend on team pricing availability', async () => {
  const r = checkout({ pricingError: { code: 'offline' } })
  assert.equal((await r.invoke({ packageId: 'cold_100' })).status, 200)
  assert.equal(r.sessions[0].line_items[0].price_data.unit_amount, 300)
  assert.equal(r.db.operations.some(o => o.table === 'sales_team_pricing'), false)
})
test('unauthenticated, unaccepted policy, and pricing failures never create a Stripe session', async () => {
  for (const [options, status] of [[{ anonymous: true }, 401], [{ accepted: false }, 412], [{ pricingError: { code: 'offline' } }, 500]]) {
    const r = checkout(options); assert.equal((await r.invoke({ packageId: 'lead_10' })).status, status)
    assert.equal(r.sessions.length, 0)
  }
})
test('authorized coupon remains valid for a regular customer, but team $21 beats coupon $22', async () => {
  for (const [pricingData, expected] of [[null, 2200], [team, 2100]]) {
    const r = checkout({ pricingData, buyer: { id: buyerId, email: 'biancazimmer.bz@gmail.com' } })
    await r.invoke({ packageId: 'lead_25', couponCode: 'LEADZIMMER22' })
    assert.equal(r.sessions[0].line_items[0].price_data.unit_amount, expected)
  }
})

function adminRoute(options = {}) {
  const db = dbMock(options)
  const { PUT } = load('src/app/api/admin/buyers/[id]/sales-team/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/api-auth': { callerBuyer: async () => options.caller === undefined ? { id: actorId, isAdmin: true } : options.caller },
  })
  return { db, invoke: (body, id = buyerId) => PUT({ json: async () => body }, { params: Promise.resolve({ id }) }) }
}
test('only authenticated admins may grant or revoke sales-team benefits', async () => {
  for (const [caller, status] of [[null, 401], [{ id: buyerId, isAdmin: false }, 403]]) {
    const r = adminRoute({ caller }); assert.equal((await r.invoke(team)).status, status)
    assert.equal(r.db.operations.length, 0)
  }
})
test('admin changes only the private pricing record and attributes the edit to session actor', async () => {
  for (const is_member of [true, false]) {
    const r = adminRoute(); const res = await r.invoke({ ...team, is_member, updated_by: 'forged', buyer_id: 'forged', is_admin: true, total_purchased: 500 })
    assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'private, no-store')
    const op = r.db.operations.find(o => o.write)
    assert.equal(op.table, 'sales_team_pricing'); assert.equal(op.write.buyer_id, buyerId)
    assert.equal(op.write.updated_by, actorId); assert.equal(op.write.is_member, is_member)
    assert.equal(op.write.lead_unit_price_cents, 2100)
    assert.deepEqual(Object.keys(op.write).sort(), ['buyer_id', 'is_member', 'lead_unit_price_cents', 'updated_at', 'updated_by'])
  }
})
test('invalid membership, price or buyer ID is rejected before any DB operation', async () => {
  for (const body of [null, {}, { ...team, is_member: 'true' }, { ...team, lead_unit_price_cents: 0 }, { ...team, lead_unit_price_cents: '2100' }, { ...team, lead_unit_price_cents: 2100.5 }]) {
    const r = adminRoute(); assert.equal((await r.invoke(body)).status, 400); assert.equal(r.db.operations.length, 0)
  }
  const r = adminRoute(); assert.equal((await r.invoke(team, 'invalid')).status, 400)
})
test('missing buyers and failed reads/writes never report successful membership changes', async () => {
  for (const [options, status] of [[{ buyer: null }, 404], [{ buyerError: { code: 'offline' } }, 500], [{ writeError: { code: 'offline' } }, 500]]) {
    const r = adminRoute(options); assert.equal((await r.invoke(team)).status, status)
  }
})
test('benefit notice has Portuguese, English and Spanish copy', () => {
  const { renderToStaticMarkup } = require('react-dom/server')
  const { SalesTeamPriceNotice } = load('src/components/sales-team-price-notice.tsx')
  for (const [locale, expected] of [['pt', 'Preço exclusivo da equipe'], ['en', 'Exclusive team pricing'], ['es', 'Precio exclusivo del equipo']]) {
    const html = renderToStaticMarkup(SalesTeamPriceNotice({ cents: 2100, locale }))
    assert.ok(html.includes(expected)); assert.ok(html.includes('21.00'))
  }
})

function card(response) {
  const states = []; let cursor = 0; let refreshed = 0; const requests = []
  const react = { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], v => { states[i] = v }] } }
  const { SalesTeamCard } = load('src/app/admin/buyers/[id]/sales-team-card.tsx', {
    react, 'next/navigation': { useRouter: () => ({ refresh: () => refreshed++ }) },
  }, { fetch: async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return response } })
  function nodes(node) { if (!node || typeof node !== 'object') return []; return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)] }
  function render() { cursor = 0; return nodes(SalesTeamCard({ buyerId, initial: { ...team, is_member: false } })) }
  return { render, states, requests, refreshed: () => refreshed }
}
test('admin checkbox autosaves once and only reflects a confirmed server response', async () => {
  const c = card({ ok: true, json: async () => team })
  await c.render().find(n => n.props?.type === 'checkbox').props.onChange({ target: { checked: true } })
  assert.equal(c.requests.length, 1); assert.equal(c.requests[0].body.lead_unit_price_cents, 2100)
  assert.equal(c.render().find(n => n.props?.type === 'checkbox').props.checked, true)
  assert.equal(c.refreshed(), 1)
})
test('failed admin save keeps membership unchanged, explains failure, and retry preserves intended toggle', async () => {
  const c = card({ ok: false, json: async () => ({ error: 'offline' }) })
  await c.render().find(n => n.props?.type === 'checkbox').props.onChange({ target: { checked: true } })
  assert.equal(c.render().find(n => n.props?.type === 'checkbox').props.checked, false)
  assert.ok(c.render().find(n => n.props?.role === 'alert')); assert.equal(c.refreshed(), 0)
  await c.render().find(n => n.type === 'button').props.onClick()
  assert.equal(c.requests[1].body.is_member, true)
})
