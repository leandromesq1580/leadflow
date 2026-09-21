const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(relative, mocks = {}) {
  const filename = path.join(__dirname, '..', relative)
  const dir = path.dirname(relative)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, Response, console: { ...console, error() {}, log() {} },
    require: name => name in mocks ? mocks[name] : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`, mocks) : (name.startsWith('./') || name.startsWith('../')) ? load(path.normalize(path.join(dir, name)) + '.ts', mocks) : require(name),
  }, { filename })
  return module.exports
}

/** Banco em memória com filtros eq/is/not/in e update/insert — o suficiente pro fluxo de frio. */
function memDb(tables) {
  const ops = []
  const match = (row, f) => f.every(([kind, col, val]) =>
    kind === 'eq' ? row[col] === val : kind === 'is' ? (val === null ? row[col] == null : row[col] === val)
      : kind === 'not_is' ? !(val === null ? row[col] == null : row[col] === val) : kind === 'in' ? val.includes(row[col]) : true)
  return { ops, tables, from(table) {
    const st = { filters: [], limit: null, order: null, write: null, insert: null, count: false, head: false }
    const rows = () => { let r = (tables[table] || []).filter(x => match(x, st.filters)); if (st.order) r = [...r].sort((a, b) => String(a[st.order.col]).localeCompare(String(b[st.order.col])) * (st.order.asc ? 1 : -1)); if (st.limit != null) r = r.slice(0, st.limit); return r }
    const exec = () => {
      ops.push({ table, ...st })
      if (st.insert) { const list = Array.isArray(st.insert) ? st.insert : [st.insert]; const made = list.map((v, i) => ({ id: `${table}-${(tables[table] || []).length + i + 1}`, ...v })); tables[table] = (tables[table] || []).concat(made); return { data: Array.isArray(st.insert) ? made : made[0], error: null } }
      if (st.write) { const r = rows(); for (const x of r) Object.assign(x, st.write); return { data: r, error: null } }
      const r = rows(); return { data: st.head ? null : r, error: null, count: st.count ? r.length : null }
    }
    const q = {
      select(_c, o) { if (o?.count) st.count = true; if (o?.head) st.head = true; return q },
      eq(c, v) { st.filters.push(['eq', c, v]); return q }, is(c, v) { st.filters.push(['is', c, v]); return q },
      not(c, op, v) { st.filters.push([op === 'is' ? 'not_is' : 'x', c, v]); return q }, in(c, v) { st.filters.push(['in', c, v]); return q },
      neq(c, v) { st.filters.push(['neq', c, v]); return q }, order(c, o) { st.order = { col: c, asc: o?.ascending !== false }; return q }, limit(n) { st.limit = n; return q },
      update(v) { st.write = v; return q }, insert(v) { st.insert = v; return q },
      async maybeSingle() { const r = exec(); return { data: Array.isArray(r.data) ? r.data[0] || null : r.data, error: null } },
      async single() { const r = exec(); return { data: Array.isArray(r.data) ? r.data[0] || null : r.data, error: null } },
      then(res, rej) { return Promise.resolve(exec()).then(res, rej) },
    }
    return q
  } }
}
const B = 'buyer-1'
const pay = { id: 'pay-1', buyer_id: B, product_type: 'cold_lead', status: 'completed', quantity: 3, amount: 12, price_per_unit: 4, lead_language: 'pt', stripe_payment_intent_id: 'pi_test', stripe_session_id: 'cs_test', created_at: '2026-09-01T00:00:00Z' }
const mk = (id, extra = {}) => ({ id, type: 'cold', status: 'new', assigned_to: null, archived: false, lead_language: 'pt', state: 'FL', name: 'L ' + id, phone: '1', email: id + '@x', city: 'C', created_at: '2026-08-0' + id.slice(-1), ...extra })
function fixture(leads) {
  const tables = { payments: [pay], buyers: [{ id: B, name: 'Teste', email: 't@x', phone: '1305', notification_phone_2: null }], buyer_states: [{ buyer_id: B, state_code: 'FL' }], credits: [], leads, lead_delivery_receipts: [], lead_notification_receipts: [] }
  const db = memDb(tables)
  // simula o trigger capture_lead_delivery_receipt: cada lead atribuído vira recibo com payment_id via crédito
  const realFrom = db.from.bind(db)
  db.from = table => { const q = realFrom(table); if (table === 'leads') { const up = q.update.bind(q); q.update = v => { const r = up(v); const t = q.then.bind(q); q.then = (res, rej) => t(out => { for (const l of out.data || []) tables.lead_delivery_receipts.push({ id: 'rc-' + l.id, lead_id: l.id, buyer_id: v.assigned_to, credit_id: v.delivery_credit_id, payment_id: pay.id, delivered_at: v.assigned_at }); return res ? res(out) : out }, rej); return q } } return q }
  return { db, tables }
}
const lib = load('src/lib/cold-leads.ts', { '@/lib/supabase/admin': {}, './supabase/admin': {} })

test('estoque conta só frio novo, sem dono, não arquivado, no idioma', async () => {
  const { db } = fixture([mk('a1'), mk('a2', { lead_language: 'es' }), mk('a3', { assigned_to: 'x' }), mk('a4', { archived: true }), mk('a5', { status: 'assigned' }), mk('a6', { type: 'hot' })])
  assert.equal(await lib.countColdStock(db, 'pt'), 1)
  assert.equal(await lib.countColdStock(db, 'es'), 1)
  assert.equal(await lib.countColdStock(db, null), 2)
  assert.equal(JSON.stringify(await lib.coldStockByLanguage(db)), JSON.stringify({ pt: 1, es: 1 })) // objeto vem de outro contexto vm
})

test('entrega: atribui do estoque, cria crédito ligado ao pagamento, recibos + aviso, nunca passa da quantidade comprada', async () => {
  const { db, tables } = fixture([mk('a1', { state: 'NY' }), mk('a2'), mk('a3'), mk('a4'), mk('a5', { lead_language: 'es' })])
  const notified = []
  const notify = async (buyer, count, lang) => { notified.push([buyer.id, count, lang]); return { email: true, whatsapp: false } }
  const r1 = await lib.deliverColdLeadsForPayment(db, 'pay-1', 2, notify)
  assert.equal(r1.delivered, 2); assert.equal(r1.remaining, 1)
  assert.deepEqual(r1.leads.map(l => l.id), ['a2', 'a3'])          // FL (estado do comprador) primeiro, mais antigos
  assert.equal(tables.credits.length, 1); assert.equal(tables.credits[0].stripe_payment_id, 'pi_test'); assert.equal(tables.credits[0].total_used, 2)
  assert.equal(tables.lead_delivery_receipts.length, 2)
  assert.equal(tables.lead_notification_receipts.length, 2); assert.equal(tables.lead_notification_receipts[0].channel, 'cold_delivery_summary'); assert.equal(tables.lead_notification_receipts[0].status, 'completed')
  assert.deepEqual(notified, [[B, 2, 'pt']])
  const st = await lib.coldPurchaseStatuses(db, B); assert.equal(st[0].delivered, 2); assert.equal(st[0].remaining, 1)
  // pede 10, só resta 1 da compra → entrega 1 (pega o NY, fora do estado, pois FL acabou); crédito reaproveitado
  const r2 = await lib.deliverColdLeadsForPayment(db, 'pay-1', 10, notify)
  assert.equal(r2.delivered, 1); assert.equal(r2.remaining, 0); assert.deepEqual(r2.leads.map(l => l.id), ['a4'])
  assert.equal(tables.credits.length, 1); assert.equal(tables.credits[0].total_used, 3)
  const r3 = await lib.deliverColdLeadsForPayment(db, 'pay-1', 5, notify)
  assert.equal(r3.delivered, 0); assert.equal(notified.length, 2)
  assert.equal(tables.leads.filter(l => l.assigned_to === B).length, 3); assert.equal(tables.leads.find(l => l.id === 'a5').assigned_to, null) // espanhol intocado
})

test('entrega sem estoque no idioma não atribui nada nem avisa', async () => {
  const { db, tables } = fixture([mk('a5', { lead_language: 'es' })])
  const r = await lib.deliverColdLeadsForPayment(db, 'pay-1', 3, async () => { throw new Error('não deveria avisar') })
  assert.equal(r.delivered, 0); assert.equal(r.remaining, 3); assert.equal(tables.lead_delivery_receipts.length, 0)
})

// ---- checkout: pacote frio só com estoque ----
const { PRODUCTS } = load('src/lib/stripe.ts', { stripe: class Stripe {} })
function checkout(stock) {
  const sessions = []
  const db = { from(table) {
    const q = { select() { return q }, eq() { return q }, is() { return q }, not() { return q } }
    q.then = (res) => res(table === 'leads' ? { data: null, error: null, count: stock } : { data: null, error: null })
    q.single = q.maybeSingle = async () => table === 'buyers' ? { data: { id: 'b', email: 'x@y', name: 'X', stripe_customer_id: null }, error: null } : { data: null, error: null }
    return q
  } }
  const { POST } = load('src/app/api/checkout/route.ts', {
    stripe: class Stripe {},
    'next/server': { NextResponse: Response },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }) },
    '@/lib/policies': { hasAcceptedCurrentPolicy: async () => true },
    '@/lib/checkout-policy': { checkoutPolicyMetadata: async () => ({}), stripeTermsConsent: () => ({}) },
    '@/lib/locale': { getLocale: async () => 'pt' },
    '@/lib/referral': { discountForOrder: async () => 0 },
    '@/lib/stripe': { PRODUCTS, getStripe: () => ({ checkout: { sessions: { create: async p => { sessions.push(p); return { url: 'https://checkout.invalid/mock' } } } } }) },
  })
  return { sessions, invoke: body => POST({ json: async () => ({ leadLanguage: 'pt', ...body }) }) }
}
test('checkout: frio com estoque insuficiente é recusado (409) antes do Stripe; com estoque passa; lead exclusivo não olha estoque', async () => {
  let r = checkout(3)
  const res = await r.invoke({ packageId: 'cold_25' })
  assert.equal(res.status, 409); assert.equal((await res.json()).code, 'COLD_STOCK'); assert.equal(r.sessions.length, 0)
  r = checkout(25); assert.equal((await r.invoke({ packageId: 'cold_25' })).status, 200); assert.equal(r.sessions.length, 1)
  r = checkout(0); assert.equal((await r.invoke({ packageId: 'lead_10' })).status, 200)
})
