/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness; no application imports or credentials. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const BUYER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
function fixture(caller = { id: BUYER, authUserId: 'owner', isAdmin: false }, adminRoute = false) {
  const events = []
  const db = {
    from(table) {
      let op = 'select'
      const q = {
        select() { return q }, update() { op = 'update'; return q }, delete() { op = 'delete'; return q },
        insert() { events.push({ table, op: 'insert' }); return q },
        eq() { events.push({ table, op }); return q },
        single() { return Promise.resolve({ data: { id: BUYER }, error: null }) },
        maybeSingle() { return q.single() },
        then(ok, bad) { return Promise.resolve({ data: null, error: null }).then(ok, bad) },
      }
      return q
    },
    async rpc(name, args) { events.push({ op: 'rpc', name, args }); return { data: null, error: null } },
  }
  const m = { exports: {} }
  const src = fs.readFileSync(path.join(root, 'src/app/api/settings/route.ts'), 'utf8')
  const req = name => {
    if (name === 'next/server') return { NextResponse: { json: (body, opts) => ({ body, status: opts?.status || 200 }) } }
    if (name === '@/lib/supabase/admin') return { createAdminClient: () => db }
    if (name === '@/lib/api-auth') return { callerBuyer: async () => caller, canActAs: (c, id) => !!c && (c.isAdmin || c.id === id) }
    if (name === '@/lib/availability') return { sanitizeHours: (period, hours) => Array.isArray(hours) ? hours.filter(h => Number.isInteger(h) && h >= 8 && h <= 20) : [] }
    throw new Error(`Unexpected import ${name}`)
  }
  new Function('require', 'module', 'exports', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(req, m, m.exports)
  if (adminRoute) {
    const admin = { exports: {} }
    const adminSrc = fs.readFileSync(path.join(root, 'src/app/api/admin/buyer-settings/route.ts'), 'utf8')
    const adminReq = name => name === '@/app/api/settings/route' ? m.exports : req(name)
    new Function('require', 'module', 'exports', ts.transpileModule(adminSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(adminReq, admin, admin.exports)
    return { events, post: body => admin.exports.POST({ json: async () => body }) }
  }
  return { events, post: body => m.exports.POST({ json: async () => body }) }
}
for (const [label, caller, body, expected] of [
  ['anonymous', null, { buyer_id: BUYER, states: ['FL'] }, 401],
  ['another buyer', { id: BUYER, authUserId: 'owner', isAdmin: false }, { buyer_id: OTHER, states: ['FL'] }, 403],
  ['null states', undefined, { buyer_id: BUYER, states: null }, 400],
  ['invalid states', undefined, { buyer_id: BUYER, states: ['INVALID'] }, 400],
  ['malformed availability', undefined, { buyer_id: BUYER, availability: [{ day_type: 'bad', period: 'morning' }] }, 400],
]) {
  test(`${label} cannot mutate settings`, async () => {
    const f = fixture(caller)
    assert.equal((await f.post(body)).status, expected)
    assert.deepEqual(f.events.filter(e => ['delete', 'insert', 'update', 'rpc'].includes(e.op)), [])
  })
}
test('supplied settings use one atomic database operation; omitted availability stays unchanged', async () => {
  const f = fixture()
  assert.equal((await f.post({ buyer_id: BUYER, states: ['FL', 'FL'], name: 'Fixture' })).status, 200)
  assert.deepEqual(f.events.filter(e => ['delete', 'insert', 'update'].includes(e.op)), [])
  const calls = f.events.filter(e => e.op === 'rpc')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].args.p_availability, null)
  assert.deepEqual(calls[0].args.p_states, ['FL'])
})
test('admin can restore states for another buyer without touching availability', async () => {
  const f = fixture({ id: BUYER, authUserId: 'owner', isAdmin: true })
  assert.equal((await f.post({ buyer_id: OTHER, states: ['FL','TX'] })).status, 200)
  const call = f.events.find(e => e.op === 'rpc')
  assert.equal(call.name, 'save_buyer_settings')
  assert.equal(call.args.p_buyer_id, OTHER)
  assert.deepEqual(call.args.p_profile, {})
  assert.equal(call.args.p_availability, null)
  assert.deepEqual(call.args.p_states, ['FL','TX'])
})
test('explicit empty states clears states only; availability-only update preserves states', async () => {
  const f = fixture()
  assert.equal((await f.post({ buyer_id: BUYER, states: [] })).status, 200)
  assert.deepEqual(f.events.find(e => e.op === 'rpc').args.p_states, [])
  const g = fixture()
  assert.equal((await g.post({ buyer_id: BUYER, availability: [] })).status, 200)
  assert.equal(g.events.find(e => e.op === 'rpc').args.p_states, null)
  assert.deepEqual(g.events.find(e => e.op === 'rpc').args.p_availability, [])
})
for (const [caller, status] of [[null,401], [{id:BUYER,authUserId:'owner',isAdmin:false},403], [{id:BUYER,authUserId:'owner',isAdmin:true},200]]) {
  test(`admin recovery endpoint returns ${status} and never bypasses settings validation`, async () => {
    const f = fixture(caller, true)
    assert.equal((await f.post({ buyer_id: OTHER, states: ['FL'] })).status, status)
    assert.equal(f.events.filter(e => e.op === 'rpc').length, status === 200 ? 1 : 0)
  })
}
test('saving only team mode never removes licenses or availability', async () => {
  const f = fixture()
  const response = await f.post({ auth_user_id: 'owner', is_agency: true, team_distribution_mode: 'manual' })
  assert.equal(response.status, 200)
  assert.deepEqual(f.events.filter(e => e.op === 'delete'), [])
  const call = f.events.find(e => e.op === 'rpc')
  if (call) { assert.equal(call.args.p_states, null); assert.equal(call.args.p_availability, null) }
})
