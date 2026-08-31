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
  vm.runInNewContext(code, { module, exports: module.exports, require: name => name in mocks ? mocks[name] : name.endsWith('/lead-language') ? loadTs('src/lib/lead-language.ts') : require(name), console, Date, Intl, process }, { filename })
  return module.exports
}

const rules = loadTs('src/lib/admin-rule.ts')
const { evaluateAdminRule, adminRuleTurn, easternDayStartISO } = rules
const jen = { id: 'jen', name: 'Jeniffer', email: 'jen@example.com', is_active: true, states: ['FL', 'CT', 'MA'], receivedToday: 0 }
const base = { admin_emails: [jen.email], one_in: 2, daily_max: null }
const noStaff = { readBuyerPolicy: async () => ({ staffIds: new Set(), metricsExcludedIds: new Set() }) }

test('regression: zero daily cap blocks even when the next position is the priority turn', () => {
  const result = evaluateAdminRule({ ...base, daily_max: 0 }, 1181, [jen], 'FL')
  assert.equal(result.isTurn, true)
  assert.equal(result.eligible, false)
  assert.equal(result.blockedReason, 'daily_paused')
})

test('removing only the daily cap enables Jeniffer without changing the 1-in-2 ratio', () => {
  let deliveries = 0
  for (let prior = 1181; prior < 1201; prior++) {
    const d = evaluateAdminRule(base, prior, [jen], 'FL')
    if (d.isTurn && d.eligible) deliveries++
  }
  assert.equal(deliveries, 10)
  assert.equal(evaluateAdminRule(base, 1181, [jen], 'CT').candidate.id, jen.id)
  assert.equal(evaluateAdminRule(base, 1182, [jen], 'CT').isTurn, false)
})

test('positive daily cap includes all system leads received today and blocks at the limit', () => {
  assert.equal(evaluateAdminRule({ ...base, daily_max: 5 }, 1, [{ ...jen, receivedToday: 4 }], 'FL').eligible, true)
  assert.equal(evaluateAdminRule({ ...base, daily_max: 5 }, 1, [{ ...jen, receivedToday: 5 }], 'FL').blockedReason, 'daily_limit')
  assert.equal(evaluateAdminRule(base, 1, [{ ...jen, receivedToday: 100 }], 'FL').eligible, true)
})

test('inactive accounts, missing licenses and disabled rules do not receive priority leads', () => {
  assert.equal(evaluateAdminRule(base, 1, [{ ...jen, is_active: false }], 'FL').blockedReason, 'inactive')
  assert.equal(evaluateAdminRule(base, 1, [jen], 'CA').blockedReason, 'no_license')
  assert.equal(evaluateAdminRule({ ...base, one_in: 0 }, 1, [jen], 'FL').blockedReason, 'disabled')
  assert.equal(evaluateAdminRule({ ...base, admin_emails: [] }, 1, [jen], 'FL').blockedReason, 'disabled')
})

test('round-robin order follows configured emails, not database return order', () => {
  const other = { ...jen, id: 'other', email: 'other@example.com', states: ['FL'] }
  const rule = { ...base, admin_emails: [jen.email, other.email] }
  assert.equal(evaluateAdminRule(rule, 1, [other, jen], 'FL').candidate.id, 'jen')
  assert.equal(evaluateAdminRule(rule, 3, [other, jen], 'FL').candidate.id, 'other')
  assert.equal(evaluateAdminRule(rule, 3, [other, jen], 'CT').candidate.id, 'jen')
  const capped = evaluateAdminRule({ ...rule, daily_max: 1 }, 3, [{ ...other, receivedToday: 1 }, jen], 'FL')
  assert.equal(capped.candidate.id, 'other')
  assert.equal(capped.eligible, false)
})

test('legacy ratio and absent cap remain supported; invalid ratio does not enable delivery', () => {
  assert.equal(evaluateAdminRule({ admin_emails: [jen.email], daily_quota: 3 }, 2, [jen], 'FL').eligible, true)
  assert.equal(adminRuleTurn({ one_in: 2 }, 1181).leadsUntilAdmin, 1)
  for (const n of [0, -1, 1.5, NaN]) assert.equal(adminRuleTurn({ one_in: n }, 1).N, 0)
})

test('daily limits reset at Eastern midnight, including daylight-saving changes', () => {
  for (const [now, midnight] of [
    ['2026-09-01T21:09:17.501Z', '2026-09-01T04:00:00.000Z'],
    ['2026-01-15T19:00:00Z', '2026-01-15T05:00:00.000Z'],
    ['2026-03-08T19:00:00Z', '2026-03-08T05:00:00.000Z'],
    ['2026-11-01T19:00:00Z', '2026-11-01T04:00:00.000Z'],
    ['2026-09-01T02:00:00Z', '2026-08-31T04:00:00.000Z'],
  ]) assert.equal(easternDayStartISO(new Date(now)), midnight)
})

test('delivery dry-run uses the same cap and license checks and never writes', async () => {
  const candidate = { ...jen, phone: '', notification_email: false, notification_sms: false }
  const fakeDb = { from() { throw Error('Unexpected write or query outside snapshot') } }
  const { tryAdminRule } = loadTs('src/lib/distribute.ts', {
    './admin-rule': rules,
    './buyer-policy': noStaff,
    './admin-rule-state': { readAdminRuleState: async () => ({ assignedCount: 1181, candidates: [candidate] }) },
    './supabase/admin': { createAdminClient: () => fakeDb },
    './notifications': {}, './availability': {}, './place-member-lead': {}, './wa-bridge': {},
  })
  assert.equal(await tryAdminRule({ state: 'FL' }, { ...base, daily_max: 0 }, true), null)
  assert.equal(await tryAdminRule({ state: 'CA' }, base, true), null)
  assert.equal((await tryAdminRule({ state: 'FL' }, base, true)).id, jen.id)
})

test('queue renders a blocked cap honestly instead of announcing PRÓXIMO', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  for (const blocked of [true, false]) {
    const fixture = { adminRule: { N: 2, leadsUntilAdmin: 1, isTurn: true, herTurnNow: !blocked, ruleAvailable: !blocked }, admins: [{ id: 'jen', nome: 'Jeniffer', estados: ['FL'], regraAdmin: 2, isFallback: false, receivedToday: 0, dailyMax: blocked ? 0 : null, blockedReason: blocked ? 'daily_paused' : null, isNext: !blocked }], fila: [] }
    const values = ['pt', fixture, false, '17:00:00', false, false]
    const { DeliveryQueueCard } = loadTs('src/components/admin/delivery-queue-card.tsx', { react: { ...React, useState: () => [values.shift(), () => {}], useRef: () => ({ current: '' }), useEffect: () => {} } })
    const html = renderToStaticMarkup(React.createElement(DeliveryQueueCard))
    if (blocked) {
      assert.match(html, /Bloqueado: limite diário = 0/)
      assert.match(html, /BLOQUEADO/)
      assert.doesNotMatch(html, /PRÓXIMO/)
    } else {
      assert.match(html, /PRÓXIMO/)
      assert.match(html, /sem limite diário/)
    }
  }
})

test('delivery writes the selected owner and notifies only on an eligible priority turn (mock database)', async () => {
  let prior = 1181
  const writes = [], notices = []
  const fakeDb = { from(table) {
    const query = {
      update(value) { writes.push({ table, value }); return query },
      eq() { return query }, select() { return query },
      maybeSingle: async () => ({ data: null }),
      then(resolve) { return Promise.resolve({ error: null }).then(resolve) },
    }
    return query
  } }
  const { tryAdminRule } = loadTs('src/lib/distribute.ts', {
    './admin-rule': rules,
    './buyer-policy': noStaff,
    './admin-rule-state': { readAdminRuleState: async () => ({ assignedCount: prior, candidates: [jen] }) },
    './supabase/admin': { createAdminClient: () => fakeDb },
    './notifications': { sendLeadNotificationEmail: async (buyer, lead) => notices.push([buyer.id, lead.id]) },
    './availability': {}, './place-member-lead': {}, './wa-bridge': {},
  })
  const lead = { id: 'fake-test-lead', state: 'FL' }
  await tryAdminRule(lead, { ...base, daily_max: 0 })
  assert.equal(writes.length, 0)
  assert.equal((await tryAdminRule(lead, base)).id, 'jen')
  assert.equal(writes.length, 1)
  assert.equal(writes[0].value.assigned_to, 'jen')
  assert.equal(notices.length, 1)
  prior++
  assert.equal(await tryAdminRule({ ...lead, id: 'fake-next-lead' }, base), null)
  assert.equal(writes.length, 1)
  assert.equal(notices.length, 1)
})

test('queue API does not announce capped/inactive/unlicensed accounts and reports daily usage', async () => {
  for (const scenario of [
    { cap: 0, today: 0, active: true, states: ['FL'], expected: false, reason: 'daily_paused' },
    { cap: 5, today: 5, active: true, states: ['FL'], expected: false, reason: 'daily_limit' },
    { cap: null, today: 0, active: false, states: ['FL'], expected: false, reason: 'inactive' },
    { cap: null, today: 0, active: true, states: [], expected: false, reason: 'no_license' },
    { cap: null, today: 0, active: true, states: ['FL'], expected: true, reason: null },
  ]) {
    const rule = { ...base, daily_max: scenario.cap }
    const candidate = { ...jen, is_active: scenario.active, states: scenario.states, receivedToday: scenario.today }
    const db = { rpc: async () => ({ data: [] }), from(table) {
      const result = table === 'settings' ? { data: { value: { admin_rule: rule } } }
        : table === 'buyers' ? { data: [candidate] }
        : table === 'buyer_states' ? { data: scenario.states.map(state_code => ({ buyer_id: jen.id, state_code })) }
        : { data: [] }
      const q = { select() { return q }, eq() { return q }, in() { return q }, not() { return q }, gte() { return q },
        single: async () => ({ data: { is_admin: true } }), maybeSingle: async () => result,
        then(resolve) { return Promise.resolve(result).then(resolve) },
      }
      return q
    } }
    const { GET } = loadTs('src/app/api/admin/delivery-queue/route.ts', {
      '@/lib/admin-rule': rules,
      '@/lib/buyer-policy': noStaff,
      '@/lib/admin-rule-state': { readAdminRuleState: async () => ({ assignedCount: 1181, candidates: [candidate] }) },
      '@/lib/supabase/admin': { createAdminClient: () => db },
      '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'test-admin' } } }) } }) },
    })
    const response = await GET()
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    const json = await response.json()
    assert.equal(json.adminRule.herTurnNow, scenario.expected)
    assert.equal(json.admins[0].isNext, scenario.expected)
    assert.equal(json.admins[0].blockedReason, scenario.reason)
    assert.equal(json.admins[0].receivedToday, scenario.today)
  }
})
