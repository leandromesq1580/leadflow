const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function loadTs(relative, mocks = {}) {
  const filename = path.join(__dirname, '..', relative)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, require: name => name in mocks ? mocks[name] : require(name), console, Date }, { filename })
  return module.exports
}

const plans = loadTs('src/lib/crm-plans.ts')

function dripFixture(paymentCreatedAt) {
  const writes = [], queried = []
  const db = { from(table) {
    queried.push(table)
    const filters = []; let mode = null, value
    const q = {
      select() { return q }, not() { return q }, eq(k, v) { filters.push([k, v]); return q },
      like(k, v) { filters.push([k, v]); return q }, order() { return q }, limit() { return q },
      insert(v) { mode = 'insert'; value = v; return q },
      maybeSingle: async () => result(true),
      then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject) },
    }
    function result(single) {
      if (mode) { writes.push({ table, value }); return { data: value, error: null } }
      if (table === 'buyers') return { data: [{ id: 'buyer', name: 'Legacy', crm_subscription_status: 'active' }], error: null }
      if (table === 'payments') return { data: { amount: 414, stripe_session_id: 'legacy-invoice', created_at: paymentCreatedAt }, error: null }
      if (table === 'credits') {
        if (filters.some(([k, v]) => k === 'stripe_payment_id' && v === 'crm-bonus:legacy-invoice:m2')) return { data: null, error: null }
        if (filters.some(([k, v]) => k === 'stripe_payment_id' && String(v).startsWith('crm-bonus-cycle:'))) return { data: [], error: null }
        return { data: [{ purchased_at: '2026-06-01T00:00:00Z' }], error: null }
      }
      return { data: single ? null : [], error: null }
    }
    return q
  } }
  const { dripLegacyCrmBonusLeads } = loadTs('src/lib/crm-bonus-drip.ts', {
    './crm-plans': plans, './supabase/admin': { createAdminClient: () => db },
  })
  return { dripLegacyCrmBonusLeads, writes, queried }
}

test('cutoff is exact: every CRM payment on or after August 1 Eastern is ineligible', () => {
  assert.equal(plans.CRM_BONUS_CUTOFF_ISO, '2026-08-01T04:00:00.000Z')
  assert.equal(plans.isLegacyCrmBonusCycle('2026-08-01T03:59:59.999Z'), true)
  assert.equal(plans.isLegacyCrmBonusCycle('2026-08-01T04:00:00.000Z'), false)
  assert.equal(plans.isLegacyCrmBonusCycle('2026-09-01T12:00:00Z'), false)
  assert.equal(plans.isLegacyCrmBonusCycle(null), false)
})

test('CRM plans no longer carry or advertise a lead entitlement', () => {
  assert.equal('LEADS_PER_MONTH' in plans, false)
  for (const plan of plans.CRM_PLAN_LIST) assert.equal('leadsPerCycle' in plan, false)
})

test('new purchase or renewal cannot enter the drip, even with old bonus history', async () => {
  const f = dripFixture('2026-08-30T15:43:25Z')
  assert.equal(await f.dripLegacyCrmBonusLeads(), 0)
  assert.equal(f.writes.length, 0)
  assert.equal(f.queried.includes('credits'), false)
})

test('an already-marked multi-month cycle paid before cutoff may finish its current cycle', async () => {
  const f = dripFixture('2026-07-23T18:58:20Z')
  assert.equal(await f.dripLegacyCrmBonusLeads(), 1)
  assert.equal(f.writes.length, 1)
  assert.equal(f.writes[0].table, 'credits')
  assert.equal(f.writes[0].value.total_purchased, 5)
  assert.equal(f.writes[0].value.stripe_payment_id, 'crm-bonus:legacy-invoice:m2')
})

test('Stripe invoice webhook has no path that creates CRM lead credits', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/app/api/webhook/stripe/route.ts'), 'utf8')
  const invoice = source.slice(source.indexOf("case 'invoice.payment_succeeded'"), source.indexOf("case 'charge.refunded'"))
  assert.doesNotMatch(invoice, /from\('credits'\)|crm-bonus|total_purchased|LEADS_PER_MONTH/)
  assert.match(invoice, /product_type: 'crm'/)
})

test('financial delivery obligations exclude historical free CRM bonus rows', () => {
  for (const file of ['src/app/api/admin/dashboard-metrics/route.ts', 'src/app/api/admin/buyer-debt/route.ts']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    assert.match(source, /crm-bonus:/)
    assert.match(source, /continue/)
  }
})
