/* eslint-disable @typescript-eslint/no-require-imports -- Isolated handler tests; synthetic data, real Supabase query serialization. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')
const root = path.resolve(__dirname, '..')
const leadId = '11111111-1111-4111-8111-111111111111'
const buyerId = '22222222-2222-4222-8222-222222222222'
const messageId = '33333333-3333-4333-8333-333333333333'
const otherLeadId = '44444444-4444-4444-8444-444444444444'
const otherBuyerId = '55555555-5555-4555-8555-555555555555'
const syntheticLead = (phone = '202 555 0123', extra = {}) => ({ id: leadId, name: 'Synthetic contact', phone, phone_digits: phone.replace(/\D/g, ''), assigned_to: buyerId, created_at: '2026-01-01T00:00:00Z', ...extra })

function matches(row, key, expression) {
  const dot = expression.indexOf('.')
  const op = expression.slice(0, dot)
  const value = expression.slice(dot + 1)
  if (op === 'eq') return String(row[key]) === value
  if (op === 'is') return value === 'null' && row[key] == null
  if (op === 'in') return value.slice(1, -1).split(',').map(v => v.replaceAll('"', '')).includes(String(row[key]))
  if (op === 'ilike') return new RegExp('^' + value.replaceAll('%', '.*') + '$', 'i').test(row[key] || '')
  if (op === 'lte') return row[key] <= value
  if (op === 'gt') return row[key] > value
  throw new Error(`Unsupported fixture predicate ${key} ${expression}`)
}

function fixture({ leads = [syntheticLead()], messages = [], caller = { id: buyerId, isAdmin: true }, failTable, failMethod = 'GET' } = {}) {
  const tables = { leads: structuredClone(leads), sms_messages: structuredClone(messages) }
  const events = [], group = [], owner = [], push = []
  const db = createClient('https://synthetic.invalid', 'synthetic-test-key', { global: { fetch: async (input, init = {}) => {
    const url = new URL(input)
    const table = url.pathname.split('/').at(-1)
    const method = init.method || 'GET'
    events.push({ table, method, query: url.searchParams.toString(), body: init.body ? JSON.parse(init.body) : null })
    if (table === failTable && method === failMethod) return new Response(JSON.stringify({ code: 'fixture_error', message: 'Synthetic database failure' }), { status: 400 })
    let rows = tables[table]
    if (!rows) throw new Error(`Unexpected table: ${table}`)
    rows = rows.filter(row => [...url.searchParams].every(([key, value]) => {
      if (['select', 'order', 'limit', 'offset'].includes(key)) return true
      if (key === 'or') return value.slice(1, -1).split(',').some(part => { const d = part.indexOf('.'); return matches(row, part.slice(0, d), part.slice(d + 1)) })
      return matches(row, key, value)
    }))
    const order = url.searchParams.get('order')
    if (order) { const [key, direction] = order.split('.'); rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (direction === 'desc' ? -1 : 1)) }
    if (url.searchParams.has('limit')) rows = rows.slice(0, Number(url.searchParams.get('limit')))
    if (method === 'POST') { const row = { id: messageId, ...JSON.parse(init.body) }; tables[table].push(row); rows = [row] }
    if (method === 'PATCH') rows.forEach(row => Object.assign(row, JSON.parse(init.body)))
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } })
  } } })
  function load(relative) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8')
    const mod = { exports: {} }
    const dependencies = {
      'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
      '@/lib/supabase/admin': { createAdminClient: () => db },
      '@/lib/api-auth': { callerBuyer: async () => caller },
      '@/lib/twilio': { validateTwilioSignature: () => true, isOptOut: () => false },
      '@/lib/notifications': { notifyGroupSmsReply: async (...args) => group.push(args), notifySmsReplyToOwner: async (...args) => owner.push(args) },
      '@/lib/push-notify': { pushToBuyer: async (...args) => push.push(args) },
      '@/lib/buyer-locale': { localeDoBuyer: async () => 'pt', trad: () => pt => pt },
    }
    const requireFixture = name => {
      if (dependencies[name]) return dependencies[name]
      if (name.startsWith('@/lib/')) return load('src/lib/' + name.slice('@/lib/'.length) + '.ts')
      throw new Error(`Unexpected dependency: ${name}`)
    }
    new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(requireFixture, mod, mod.exports)
    return mod.exports
  }
  return {
    tables, events, group, owner, push,
    async inbound(from = '+12025550123') {
      const body = new URLSearchParams({ From: from, To: '+18885550100', Body: 'Synthetic reply', MessageSid: 'SM_synthetic' })
      return load('src/app/api/webhook/twilio-sms/route.ts').POST(new Request('https://synthetic.invalid/api/webhook/twilio-sms', { method: 'POST', body }))
    },
    async recover(payload = { message_id: messageId, lead_id: leadId, expected_owner_id: buyerId }) {
      return load('src/app/api/admin/sms/link-reply/route.ts').POST(new Request('https://synthetic.invalid/api/admin/sms/link-reply', { method: 'POST', body: JSON.stringify(payload) }))
    },
  }
}

for (const phone of ['202 555 0123', '(202) 555-0123', '+1 (202) 555-0123', '12025550123', '2025550123']) {
  test(`inbound resolves formatted phone ${phone} and notifies its owner`, async () => {
    const f = fixture({ leads: [syntheticLead(phone)] })
    assert.equal((await f.inbound()).status, 200)
    assert.equal(f.tables.sms_messages[0].lead_id, leadId)
    assert.equal(f.owner[0][0], buyerId)
    assert.equal(f.push.length, 1)
  })
}

test('formatted duplicate retains outbound-history ownership rather than newest lead', async () => {
  const f = fixture({ leads: [syntheticLead(), syntheticLead('+12025550123', { id: otherLeadId, assigned_to: otherBuyerId, created_at: '2026-02-01T00:00:00Z' })], messages: [{ id: 'outbound', lead_id: leadId, direction: 'out', created_at: '2026-03-01T00:00:00Z' }] })
  await f.inbound()
  assert.equal(f.tables.sms_messages.at(-1).lead_id, leadId)
  assert.equal(f.owner[0][0], buyerId)
})

test('foreign phone sharing NANP suffix is not matched', async () => {
  const f = fixture({ leads: [syntheticLead('+55 2025550123')] })
  await f.inbound()
  assert.equal(f.tables.sms_messages[0].lead_id, null)
  assert.equal(f.owner.length, 0)
})

test('international formatted phone matches only its full country-qualified number', async () => {
  const f = fixture({ leads: [syntheticLead('+44 20 7946 0123')] })
  await f.inbound('+442079460123')
  assert.equal(f.tables.sms_messages[0].lead_id, leadId)
})

const storedReply = (extra = {}) => ({ id: messageId, lead_id: null, direction: 'in', status: 'received', from_phone: '12025550123', to_phone: '18885550100', body: 'Synthetic historical reply', twilio_sid: 'SM_synthetic_historical', created_at: '2026-03-01T12:00:00Z', ...extra })
const storedOutbound = (extra = {}) => ({ id: '66666666-6666-4666-8666-666666666666', lead_id: leadId, direction: 'out', status: 'sent', to_phone: '12025550123', created_at: '2026-03-01T11:00:00Z', ...extra })

test('admin links a saved reply without resending, copying, or changing its content/timestamp', async () => {
  const before = storedReply()
  const f = fixture({ messages: [before, storedOutbound()] })
  const response = await f.recover()
  assert.equal(response.status, 200)
  assert.deepEqual(f.tables.sms_messages[0], { ...before, lead_id: leadId })
  assert.equal(f.tables.sms_messages.length, 2)
  assert.equal(f.events.filter(e => e.method === 'POST').length, 0)
  assert.equal(f.owner.length + f.group.length + f.push.length, 0)
  assert.deepEqual(f.events.find(e => e.method === 'PATCH').body, { lead_id: leadId })
  assert.equal((await f.recover()).status, 200)
  assert.equal(f.events.filter(e => e.method === 'PATCH').length, 1, 'retry must be idempotent')
})

for (const [label, options, expected] of [
  ['unauthenticated', { caller: null }, 401],
  ['not admin', { caller: { id: buyerId, isAdmin: false } }, 403],
  ['owner changed', { leads: [syntheticLead(undefined, { assigned_to: otherBuyerId })] }, 409],
  ['different phone', { leads: [syntheticLead('2025550999')] }, 409],
  ['foreign suffix collision', { leads: [syntheticLead('+552025550123')] }, 409],
  ['already linked elsewhere', { messages: [storedReply({ lead_id: otherLeadId }), storedOutbound()] }, 409],
  ['not inbound', { messages: [storedReply({ direction: 'out' }), storedOutbound()] }, 409],
  ['no earlier outbound', { messages: [storedReply()] }, 409],
  ['future outbound', { messages: [storedReply(), storedOutbound({ created_at: '2026-03-02T12:00:00Z' })] }, 409],
  ['failed outbound', { messages: [storedReply(), storedOutbound({ status: 'failed' })] }, 409],
  ['outbound to another phone', { messages: [storedReply(), storedOutbound({ to_phone: '12025550999' })] }, 409],
  ['lead read failed', { failTable: 'leads' }, 503],
  ['message read failed', { failTable: 'sms_messages' }, 503],
]) {
  test(`recovery refuses ${label} without writes`, async () => {
    const f = fixture({ messages: [storedReply(), storedOutbound()], ...options })
    assert.equal((await f.recover()).status, expected)
    assert.equal(f.events.filter(e => e.method !== 'GET').length, 0)
  })
}

test('recovery reports write failure without claiming success', async () => {
  const f = fixture({ messages: [storedReply(), storedOutbound()], failTable: 'sms_messages', failMethod: 'PATCH' })
  assert.equal((await f.recover()).status, 503)
  assert.equal(f.tables.sms_messages[0].lead_id, null)
})

test('recovery validates explicit identifiers before querying business records', async () => {
  const f = fixture()
  assert.equal((await f.recover({ message_id: 'bad', lead_id: leadId, expected_owner_id: buyerId })).status, 400)
  assert.equal(f.events.length, 0)
})

