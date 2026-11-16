const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function fixture({ member = { auth_user_id: 'member-auth' }, memberBuyer = { id: 'member-buyer' }, memberError = null, buyerError = null, dedupeError = null, duplicate = false, insertError = null, candidatesError = null, historyError = null, optout = false, candidates } = {}) {
  const calls = { owner: [], group: [], push: [], writes: [], queries: [] }
  const queues = {
    sms_messages: [{ data: duplicate ? { id: 'existing' } : null, error: dedupeError }, { data: [], error: historyError }],
    leads: [{ data: candidates || [{ id: 'lead', name: 'Synthetic lead', phone: '2025550101', assigned_to: 'agency', assigned_to_member: 'member', created_at: '2026-01-01' }], error: candidatesError }],
    team_members: [{ data: member, error: memberError }],
    buyers: [{ data: memberBuyer, error: buyerError }],
  }
  const db = { from(table) {
    let write = false
    const q = {}
    for (const op of ['select','eq','in','is','order','limit','lte','gt']) q[op] = (...args) => { calls.queries.push({ table, op, args }); return q }
    for (const op of ['insert','update']) q[op] = row => { write = true; calls.writes.push({ table, op, row }); return q }
    const resolve = () => Promise.resolve(write ? { error: table === 'sms_messages' ? insertError : null } : queues[table]?.shift() || { data: null, error: null })
    q.maybeSingle = resolve
    q.then = (a,b) => resolve().then(a,b)
    return q
  } }
  const deps = {
    'next/server': {},
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/twilio': { validateTwilioSignature: () => true, isOptOut: () => optout },
    '@/lib/notifications': { notifyGroupSmsReply: async (...args) => calls.group.push(args), notifySmsReplyToOwner: async (...args) => calls.owner.push(args) },
    '@/lib/push-notify': { pushToBuyer: async (...args) => calls.push.push(args) },
    '@/lib/buyer-locale': { localeDoBuyer: async () => 'pt', trad: () => pt => pt },
  }
  const mod = { exports: {} }
  const source = fs.readFileSync(path.resolve('src/app/api/webhook/twilio-sms/route.ts'), 'utf8')
  new Function('require','module','exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => { if (!(name in deps)) throw Error(name); return deps[name] }, mod, mod.exports)
  return { calls, run: () => mod.exports.POST({ text: async () => 'From=%2B12025550101&To=%2B18885550100&Body=Hello&MessageSid=SM_SYNTHETIC', headers: { get: () => null } }) }
}

test('SMS resolves delegated member before notifying; never copies agency/admin', async () => {
  const f = fixture()
  assert.equal((await f.run()).status, 200)
  assert.equal(f.calls.owner[0][0], 'member-buyer')
  assert.equal(f.calls.push[0][0], 'member-buyer')
  assert.equal(f.calls.group.length, 0)
  assert.ok(f.calls.queries.some(q => q.table === 'leads' && q.op === 'select' && q.args[0].includes('assigned_to_member')))
})

test('member without its own account falls back to agency', async () => {
  const f = fixture({ memberBuyer: null })
  assert.equal((await f.run()).status, 200)
  assert.equal(f.calls.owner[0][0], 'agency')
  assert.equal(f.calls.push[0][0], 'agency')
})

for (const options of [{ memberError: { code: 'unavailable' } }, { buyerError: { code: 'unavailable' } }, { dedupeError: { code: 'unavailable' } }, { candidatesError: { code: 'unavailable' } }, { historyError: { code: 'unavailable' }, candidates: [
  { id: 'a', phone: '2025550101', assigned_to: 'a', created_at: '2026-01-01' },
  { id: 'b', phone: '2025550101', assigned_to: 'b', created_at: '2026-01-02' },
] }]) test('routing read failure must retry, not persist/notify an arbitrary owner: ' + Object.keys(options)[0], async () => {
  const f = fixture(options)
  assert.equal((await f.run()).status, 503)
  assert.deepEqual(f.calls.writes, [])
  assert.deepEqual(f.calls.owner, [])
  assert.deepEqual(f.calls.group, [])
  assert.deepEqual(f.calls.push, [])
})

for (const options of [{ duplicate: true }, { insertError: { code: '23505' } }, { optout: true }]) test('duplicate/unique race/STOP has no alerts: ' + Object.keys(options)[0], async () => {
  const f = fixture(options)
  assert.equal((await f.run()).status, 200)
  assert.deepEqual(f.calls.owner, [])
  assert.deepEqual(f.calls.group, [])
  assert.deepEqual(f.calls.push, [])
})

test('persistence failure is retried without notifications', async () => {
  const f = fixture({ insertError: { code: 'unavailable' } })
  assert.equal((await f.run()).status, 503)
  assert.deepEqual(f.calls.owner, [])
  assert.deepEqual(f.calls.push, [])
})

test('member-only lead is owned and must not leak its reply to admin', async () => {
  const f = fixture({ candidates: [{ id: 'lead', phone: '2025550101', assigned_to: null, assigned_to_member: 'member', created_at: '2026-01-01' }] })
  assert.equal((await f.run()).status, 200)
  assert.equal(f.calls.owner[0][0], 'member-buyer')
  assert.equal(f.calls.push[0][0], 'member-buyer')
  assert.deepEqual(f.calls.group, [])
})

for (const member of [null, { auth_user_id: null }]) test('missing member account falls back to agency: ' + JSON.stringify(member), async () => {
  const f = fixture({ member })
  assert.equal((await f.run()).status, 200)
  assert.equal(f.calls.owner[0][0], 'agency')
  assert.deepEqual(f.calls.group, [])
})
