import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule, ModuleKind } from 'typescript'
import * as languages from '../src/lib/lead-language'

type Query = { table: string; calls: [string, ...any[]][] }
function database(resolve: (query: Query) => any, rpc: (...args: any[]) => any) {
  const queries: Query[] = []
  return {
    queries, rpc,
    from(table: string) {
      const query: Query = { table, calls: [] }
      queries.push(query)
      const chain: any = new Proxy({}, { get: (_, key) => key === 'then'
        ? (accept: any, reject: any) => Promise.resolve(resolve(query)).then(accept, reject)
        : (...args: any[]) => { query.calls.push([String(key), ...args]); return chain } })
      return chain
    },
  }
}
const filtered = (q: Query, column: string, value: unknown) => q.calls.some(c => c[0] === 'eq' && c[1] === column && c[2] === value)

function distribution(db: any, notifications: any[]) {
  const dependencies: Record<string, any> = {
    './supabase/admin': { createAdminClient: () => db },
    './notifications': { sendLeadNotificationEmail: async (...args: any[]) => notifications.push(args) },
    './availability': { buyerTimezone: () => 'America/New_York', isAvailableNow: () => true },
    './place-member-lead': {}, './wa-bridge': {}, './lead-language': languages,
    './admin-rule': { adminRuleTurn: () => ({ N: 0 }), easternDayStartISO: () => '2026-01-01T00:00:00Z', evaluateAdminRule: () => ({}) },
    './admin-rule-state': { readAdminRuleState: async () => ({ assignedCount: 0, candidates: [] }) },
    './buyer-policy': { readBuyerPolicy: async () => ({ staffIds: new Set() }), withoutStaff: (rows: any[]) => rows },
    './automation-engine': { runAutomations: async () => ({ ran: 0, failed: 0 }) },
  }
  const js = transpileModule(readFileSync(new URL('../src/lib/distribute.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', js)((name: string) => {
    assert.ok(name in dependencies, name)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}

const lead = { id: 'lead', name: 'Fixture', email: 'fixture@example.invalid', phone: '', city: '', state: 'FL', interest: '', campaign_name: '', product_type: 'lead', lead_language: 'es' }

test('Spanish leads use the configured operational fallback; unknown language and queue failure fail closed', async () => {
  const calls: any[] = []
  const fallback = { id: 'fallback', name: 'Regiane', email: 'regiane@example.invalid' }
  const db = database(q => {
    if (q.table === 'settings') return { data: { value: { fallback_email: fallback.email } }, error: null }
    if (q.table === 'buyers') return { data: fallback, error: null }
    if (q.table === 'leads') return { data: null, error: null }
    if (q.table === 'pipelines') return { data: null, error: null }
    throw new Error(`Unexpected fallback query: ${q.table}`)
  }, async (...args) => { calls.push(args); return { data: [], error: null } })
  const notices: any[] = []
  const app = distribution(db, notices)
  assert.equal(await app.tryAdminRule(lead, { admin_emails: ['admin@example.invalid'], one_in: 1 }), null)
  assert.equal((await app.distributeLeadToNextBuyer(lead)).id, fallback.id)
  assert.deepEqual(calls[0], ['get_eligible_buyers_by_language', { p_product_type: 'lead', p_state: 'FL', p_language: 'es' }])
  assert.equal(await app.distributeLeadToNextBuyer({ ...lead, meta_lead_id: 'unknown', lead_language: null }), null)
  assert.equal(calls.length, 1)
  db.rpc = async () => ({ data: null, error: { message: 'test failure' } })
  assert.equal(await app.distributeLeadToNextBuyer({ ...lead, lead_language: 'pt' }), null)
  assert.equal(notices.length, 1)
})

test('normal distribution uses language queue, language daily floor, and only the returned credit', async () => {
  for (const language of ['pt', 'es']) {
    const buyer = { id: `buyer-${language}`, name: 'Fixture', email: 'fixture@example.invalid', remaining: 10, leads_count: 0, credit_id: `credit-${language}` }
    const db = database(q => {
      if (q.table === 'buyers') return { data: q.calls.some(c => c[0] === 'single') ? null : [buyer] }
      if (q.table === 'credits') return { data: { total_used: 0 } }
      if (q.table === 'settings' || q.table === 'pipelines') return { data: null }
      return { data: [], error: null }
    }, async (name, args) => {
      assert.equal(args.p_language, language)
      if (name === 'get_eligible_buyers_by_language') return { data: [buyer], error: null }
      assert.equal(name, 'assign_paid_lead_with_credit')
      assert.equal(args.p_buyer_id, buyer.id)
      return { data: buyer.credit_id, error: null }
    })
    const notices: any[] = []
    assert.equal((await distribution(db, notices).distributeLeadToNextBuyer({ ...lead, lead_language: language })).id, buyer.id)
    const credits = db.queries.filter(q => q.table === 'credits')
    assert.equal(credits.length, 0)
    assert.ok(db.queries.some(q => q.table === 'leads' && filtered(q, 'lead_language', language)))
    assert.equal(notices.length, 1)
  }
})

test('forced routing cannot spend BR credits for a Spanish lead', async () => {
  const rpcCalls: any[] = []
  const db = database(q => {
    if (q.table === 'buyers') return { data: [{ id: 'br-buyer', email: 'br@example.invalid' }] }
    if (q.table === 'buyer_states') return { data: [{ buyer_id: 'br-buyer', state_code: 'FL' }] }
    throw new Error('Unexpected write or notification')
  }, async (name, args) => { rpcCalls.push([name, args]); return { data: [], error: null } })
  const notices: any[] = []
  assert.equal(await distribution(db, notices).forceAssignRoundRobin(lead, ['br@example.invalid']), null)
  assert.equal(notices.length, 0)
  assert.deepEqual(rpcCalls, [['get_eligible_buyers_by_language', { p_product_type: 'lead', p_state: 'FL', p_language: 'es' }]])
  assert.ok(db.queries.every(q => !q.calls.some(c => ['update', 'insert', 'upsert'].includes(c[0]))))
})
