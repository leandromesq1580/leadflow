const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTs(relative, mocks = {}) {
  const filename = path.join(__dirname, '..', relative)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, require: name => name in mocks ? mocks[name] : require(name), console, Date, Intl, URL, process: { env: {} } }, { filename })
  return module.exports
}

const policy = loadTs('src/lib/buyer-policy.ts')
const rules = loadTs('src/lib/admin-rule.ts')
const state = loadTs('src/lib/admin-rule-state.ts', { './admin-rule': rules })
const gab = { id: 'gabriel', name: 'Gabriel Stroppa', email: 'staff@example.test', is_active: true, is_admin: false, remaining: 56, leads_count: 44, credit_id: 'internal-credit', created_at: '2026-08-01' }
const customer = { id: 'customer', name: 'Customer', email: 'customer@example.test', is_active: true, is_admin: false, remaining: 10, leads_count: 0, credit_id: 'paid-credit', created_at: '2026-08-02' }
const lead = { id: 'test-lead', name: 'Test', state: 'FL', product_type: 'lead', meta_lead_id: 'test-meta', assigned_to: null }

// In-memory query adapter: the real routing/API code runs, but cannot access a network.
function fixture({ routing = {}, extra = {}, eligible = [gab, customer] } = {}) {
  const tables = {
    settings: [{ key: 'staff_buyers', value: { buyers: [gab.id] } }, { key: 'lead_routing', value: routing }],
    buyers: [gab, customer, { id: 'admin', auth_user_id: 'admin-auth', is_admin: true }],
    credits: [
      { id: gab.credit_id, buyer_id: gab.id, type: 'lead', total_purchased: 100, total_used: 44 },
      { id: customer.credit_id, buyer_id: customer.id, type: 'lead', total_purchased: 10, total_used: 0 },
    ],
    buyer_states: [gab, customer].map(b => ({ buyer_id: b.id, state_code: 'FL' })),
    buyer_availability: [], pipelines: [], payments: [], leads: [lead],
    ...extra,
  }
  const writes = [], queries = [], notices = []
  const db = { rpc: async () => ({ data: eligible }), from(table) {
    const filters = []; let options = {}, mode = null, value, limit = Infinity
    const q = {
      select(columns, opts = {}) { options = opts; return q },
      eq(k, v) { filters.push(r => r[k] === v); return q },
      in(k, vs) { filters.push(r => vs.includes(r[k])); return q },
      not(k, op, v) { filters.push(r => v === null ? r[k] != null : r[k] !== v); return q },
      neq(k, v) { filters.push(r => r[k] !== v); return q },
      gte(k, v) { filters.push(r => r[k] >= v); return q },
      lt(k, v) { filters.push(r => r[k] < v); return q },
      order() { return q }, limit(n) { limit = n; return q },
      update(v) { mode = 'update'; value = v; return q },
      upsert(v) { mode = 'upsert'; value = v; return q },
      single: async () => result(true), maybeSingle: async () => result(true),
      then(resolve, reject) { return Promise.resolve().then(() => result(false)).then(resolve, reject) },
    }
    function result(single) {
      queries.push(table)
      const rows = (tables[table] || []).filter(r => filters.every(f => f(r))).slice(0, limit)
      if (mode) writes.push({ table, mode, value, ids: rows.map(r => r.id) })
      return { data: options.head ? null : single ? rows[0] || null : rows, count: rows.length, error: null }
    }
    return q
  } }
  return { db, writes, queries, notices, tables }
}

function distribution(f) {
  return loadTs('src/lib/distribute.ts', {
    './supabase/admin': { createAdminClient: () => f.db }, './buyer-policy': policy,
    './admin-rule': rules, './admin-rule-state': state,
    './availability': { buyerTimezone: () => 'America/New_York', isAvailableNow: () => true },
    './notifications': { sendLeadNotificationEmail: async buyer => f.notices.push(buyer.id) },
    './place-member-lead': {}, './wa-bridge': {},
  })
}

function api(relative, f) {
  return loadTs(relative, {
    '@/lib/supabase/admin': { createAdminClient: () => f.db },
    '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-auth' } } }) } }) },
    '@/lib/buyer-policy': policy, '@/lib/admin-rule': rules, '@/lib/admin-rule-state': state,
  })
}

test('only explicit staff membership excludes a buyer from routing; metrics exclusions stay separate', async () => {
  const f = fixture()
  f.tables.settings.push({ key: 'metrics_exclude_buyers', value: { buyers: [customer.id] } })
  const p = await policy.readBuyerPolicy(f.db)
  assert.equal(p.staffIds.has(gab.id), true)
  assert.equal(p.staffIds.has(customer.id), false)
  assert.equal(p.metricsExcludedIds.size, 2)
  assert.equal(policy.withoutStaff([gab, customer], p.staffIds)[0].id, customer.id)
  assert.equal(f.writes.length, 0)
})

test('missing staff setting does not classify admins or courtesy accounts as employees', async () => {
  const f = fixture({ extra: { settings: [] } })
  assert.equal((await policy.readBuyerPolicy(f.db)).staffIds.size, 0)
})

test('unreadable or malformed policy fails instead of silently putting employees back in queue', async () => {
  const db = { from: () => ({ select: () => ({ in: async () => ({ error: new Error('database unavailable') }) }) }) }
  await assert.rejects(policy.readBuyerPolicy(db), /database unavailable/)
  const f = fixture({ extra: { settings: [{ key: 'staff_buyers', value: { buyers: 'invalid' } }] } })
  await assert.rejects(policy.readBuyerPolicy(f.db), /Invalid buyer policy/)
})

for (const queue_order of ['credito', 'antiguidade', 'hibrido', 'rodizio']) {
  test(`normal ${queue_order} queue never delivers to staff despite higher credits`, async () => {
    const f = fixture({ routing: { queue_order } })
    const picked = await distribution(f).distributeLeadToNextBuyer(lead)
    assert.equal(picked.id, customer.id)
    assert.deepEqual(f.notices, [customer.id])
    assert.equal(f.writes.find(w => w.table === 'leads').value.assigned_to, customer.id)
    assert.deepEqual(f.writes.find(w => w.table === 'credits').ids, [customer.credit_id])
    assert.equal(f.tables.credits[0].total_used, 44)
  })
}

test('staff-only pool cannot bypass exclusion or consume internal credits', async () => {
  const f = fixture()
  assert.equal(await distribution(f).forceAssignRoundRobin(lead, [gab.email]), null)
  assert.equal(f.writes.length, 0)
  assert.equal(f.notices.length, 0)
})

test('mixed paid pool delivers to the customer, never the employee', async () => {
  const f = fixture()
  assert.equal((await distribution(f).forceAssignRoundRobin(lead, [gab.email, customer.email])).id, customer.id)
  assert.deepEqual(f.writes.find(w => w.table === 'credits').ids, [customer.credit_id])
})

test('staff cannot receive through fallback when no customer is eligible', async () => {
  const f = fixture({ eligible: [gab], routing: { fallback_email: gab.email } })
  assert.equal(await distribution(f).distributeLeadToNextBuyer(lead), null)
  assert.equal(f.writes.length, 0)
  assert.equal(f.notices.length, 0)
})

test('explicit priority can deliver to staff with no credits and without debiting', async () => {
  const f = fixture({ extra: { credits: [] } })
  const d = distribution(f)
  const rule = { admin_emails: [gab.email], one_in: 1, daily_max: null }
  assert.equal((await d.tryAdminRule(lead, rule, true)).id, gab.id)
  assert.equal(f.writes.length, 0)
  assert.equal((await d.tryAdminRule(lead, rule)).id, gab.id)
  assert.deepEqual(f.notices, [gab.id])
  assert.equal(f.writes.length, 1)
  assert.equal(f.writes[0].table, 'leads')
  assert.equal(f.writes[0].value.assigned_to, gab.id)
  assert.equal(f.queries.includes('credits'), false)
})

test('staff status does not alter another selected recipient or override priority licensing', async () => {
  const f = fixture()
  const d = distribution(f)
  const rule = { admin_emails: [customer.email], one_in: 2, daily_max: null }
  assert.equal((await d.tryAdminRule(lead, rule, true)).id, customer.id)
  assert.equal(await d.tryAdminRule({ ...lead, state: 'CA' }, { ...rule, admin_emails: [gab.email] }, true), null)
  assert.equal(f.writes.length, 0)
})

test('admin queue excludes staff even if a stale fallback names them; priority explicitly includes them', async () => {
  for (const priority of [false, true]) {
    const f = fixture({ routing: { fallback_email: gab.email, admin_rule: { admin_emails: priority ? [gab.email] : [], one_in: 1 } } })
    const response = await api('src/app/api/admin/delivery-queue/route.ts', f).GET()
    assert.equal(response.status, 200)
    const json = await response.json()
    assert.deepEqual(json.fila.map(b => b.id), [customer.id])
    assert.equal(json.admins.length, priority ? 1 : 0)
    if (priority) {
      assert.equal(json.admins[0].id, gab.id)
      assert.equal(json.admins[0].isStaff, true)
      assert.equal(json.admins[0].isNext, true)
      assert.equal(json.admins[0].isFallback, false)
    }
    assert.equal(f.writes.length, 0)
  }
})

test('customer queue position ignores the employee; employee sees priority-only status', async () => {
  const f = fixture()
  const { getQueuePosition } = loadTs('src/lib/queue-position.ts', {
    './buyer-policy': policy, './availability': { buyerTimezone: () => 'America/New_York', isAvailableNow: () => true },
  })
  const staff = await getQueuePosition(f.db, gab.id)
  assert.equal(staff.isStaff, true)
  assert.equal(staff.states.length, 0)
  assert.equal(staff.hasCredits, false)
  assert.deepEqual(f.queries, ['settings'])
  const client = await getQueuePosition(f.db, customer.id)
  assert.equal(client.best.position, 1)
  assert.equal(client.best.total, 1)
  assert.equal(client.credits, 10)
})

test('staff credits are not included in sold/delivered/owed totals or delivery debt even if paid', async () => {
  const f = fixture({ extra: { payments: [gab, customer].map(b => ({ buyer_id: b.id, status: 'completed', product_type: 'lead', amount: 100 })) } })
  const debt = await (await api('src/app/api/admin/buyer-debt/route.ts', f).GET()).json()
  assert.equal(debt.total_devido, 10)
  assert.deepEqual(debt.compradores.map(b => b.id), [customer.id])
  const metrics = await (await api('src/app/api/admin/dashboard-metrics/route.ts', f).GET({ url: 'https://example.test/api/admin/dashboard-metrics?period=all' })).json()
  assert.equal(metrics.soldLeads, 10)
  assert.equal(metrics.deliveredPaid, 0)
  assert.equal(metrics.owedLeads, 10)
  assert.equal(metrics.revenue, 200) // Actual cash payments are not erased.
  assert.equal(f.writes.length, 0)
})

test('credit reconciliation never retroactively charges employee priority deliveries', async () => {
  const f = fixture({ extra: { leads: Array.from({ length: 60 }, (_, i) => ({ id: `test-${i}`, assigned_to: gab.id, meta_lead_id: `meta-${i}` })) } })
  const json = await (await api('src/app/api/admin/reconcile-credits/route.ts', f).GET({ url: 'https://example.test/api/admin/reconcile-credits?apply=1' })).json()
  assert.equal(json.afetados, 0)
  assert.equal(f.writes.length, 0)
})

test('admin agent options expose employee status without granting admin permissions', async () => {
  const f = fixture()
  const json = await (await api('src/app/api/admin/agents/route.ts', f).GET()).json()
  assert.equal(json.agents.find(b => b.id === gab.id).is_staff, true)
  assert.equal(json.agents.find(b => b.id === customer.id).is_staff, false)
  assert.equal(f.writes.length, 0)
})

test('employee queue notice is localized in Portuguese, English and Spanish', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  for (const [locale, expected] of [['pt', 'Conta de funcionário'], ['en', 'Staff account'], ['es', 'Cuenta de empleado']]) {
    const values = [{ isStaff: true, hasCredits: false }, false]
    const { QueuePositionCard } = loadTs('src/components/queue-position-card.tsx', {
      react: { ...React, useState: () => [values.shift(), () => {}], useEffect: () => {} },
      '@/lib/i18n-client': { useT: () => ({ _locale: locale }) },
    })
    assert.match(renderToStaticMarkup(React.createElement(QueuePositionCard)), new RegExp(expected))
  }
})
