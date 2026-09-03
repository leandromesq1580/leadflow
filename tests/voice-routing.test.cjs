const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const crypto = require('node:crypto')

// All fixtures are fictional. No calls, Twilio requests or database writes.
const fallback = '+18505550100'
const env = { TWILIO_FROM_NUMBER: fallback, TWILIO_AUTH_TOKEN: 'test-secret' }
function loadTs(relative, mocks = {}) {
  const filename = path.join(__dirname, '..', relative)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name in mocks) return mocks[name]
    if (name.startsWith('@/')) return loadTs(`src/${name.slice(2)}.ts`, mocks)
    return require(name)
  }, console, Date, Intl, Buffer, URLSearchParams, Response, process: { env } }, { filename })
  return module.exports
}
const voice = loadTs('src/lib/voice.ts')
const { selectVoiceCallerId: select, pickCallerId } = voice
const pool = [
  { phone_number: '+18175550100', area_code: '817', state: 'TX' },
  { phone_number: '+18575550100', area_code: '857', state: 'MA' },
]
const leadId = '11111111-1111-4111-8111-111111111111'

function fakeDb({ lead = null, numbers = pool, leadError = null, poolError = null, throwLead = false, throwPool = false } = {}) {
  const reads = []
  return { reads, from(table) {
    reads.push(table)
    assert.ok(['leads', 'voice_numbers', 'settings'].includes(table))
    if (table === 'leads' && throwLead) throw Error('lead unavailable')
    if (table === 'voice_numbers' && throwPool) throw Error('pool unavailable')
    const result = table === 'leads' ? { data: lead, error: leadError }
      : table === 'voice_numbers' ? { data: numbers, error: poolError } : { data: [] }
    const query = { select() { return query }, eq(key, value) { assert.equal(key, 'id'); assert.equal(value, leadId); return query },
      order() { return query }, in() { return query }, maybeSingle: async () => result,
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) },
    }
    return query
  } }
}

test('Texas: one purchased number serves different area codes in the state', () => {
  for (const ac of ['214', '281', '512', '713', '817', '915'])
    assert.equal(select(pool, `+1${ac}5550101`, 'TX', fallback), pool[0].phone_number)
})

test('Massachusetts: one purchased number serves all existing mapped area codes', () => {
  for (const ac of ['339', '351', '413', '508', '617', '774', '781', '857', '978'])
    assert.equal(select(pool, `+1${ac}5550101`, 'MA', fallback), pool[1].phone_number)
})

test('saved lead state wins when a person keeps an out-of-state phone number', () => {
  assert.equal(select(pool, '+18575550101', ' tx ', fallback), pool[0].phone_number)
  assert.equal(select(pool, '+18175550101', 'ma', fallback), pool[1].phone_number)
  assert.equal(select(pool, '+18175550101', 'CA', fallback), fallback)
})

test('missing or invalid state infers the state from a formatted phone number', () => {
  assert.equal(select(pool, '(512) 555-0101', null, fallback), pool[0].phone_number)
  assert.equal(select(pool, '+1 (617) 555-0101', '', fallback), pool[1].phone_number)
  assert.equal(select(pool, '6175550101', 'invalid', fallback), pool[1].phone_number)
})

test('same area code is preferred within a state, otherwise oldest pool entry wins', () => {
  const second = { phone_number: '+15125550100', area_code: '512', state: 'TX' }
  assert.equal(select([...pool, second], '+15125550101', 'TX', fallback), second.phone_number)
  assert.equal(select([...pool, second], '+12145550101', 'TX', fallback), pool[0].phone_number)
})

test('unconfigured states, empty pool and invalid/international phones preserve fallback', () => {
  for (const phone of ['+13055550101', '+14155550101', '+5511999999999', null, '', '123'])
    assert.equal(select(pool, phone, null, fallback), fallback)
  assert.equal(select([], '+15125550101', 'TX', fallback), fallback)
})

test('invalid pool values are ignored and legacy entries without state remain usable', () => {
  assert.equal(select([{ ...pool[0], phone_number: 'not-a-number' }], '+15125550101', 'TX', fallback), fallback)
  assert.equal(select([{ ...pool[0], state: null }], '+15125550101', 'TX', fallback), pool[0].phone_number)
})

test('database lookup uses the saved state only for the phone actually being dialed', async () => {
  const db = fakeDb({ lead: { state: 'TX', phone: '(617) 555-0101' } })
  assert.equal(await pickCallerId(db, '+16175550101', leadId), pool[0].phone_number)
  assert.deepEqual(db.reads, ['leads', 'voice_numbers'])
  assert.equal(await pickCallerId(fakeDb({ lead: { state: 'TX', phone: '+14155550101' } }), '+16175550101', leadId), pool[1].phone_number)
})

test('missing or malformed lead ID uses phone inference without querying a random lead', async () => {
  for (const id of [undefined, '', 'invalid']) {
    const db = fakeDb()
    assert.equal(await pickCallerId(db, '+15125550101', id), pool[0].phone_number)
    assert.deepEqual(db.reads, ['voice_numbers'])
  }
})

test('missing lead and database errors do not interrupt existing calls', async () => {
  for (const options of [{}, { leadError: { message: 'unavailable' } }, { throwLead: true }])
    assert.equal(await pickCallerId(fakeDb(options), '+16175550101', leadId), pool[1].phone_number)
  for (const options of [{ numbers: [] }, { poolError: { message: 'missing table' } }, { throwPool: true }])
    assert.equal(await pickCallerId(fakeDb(options), '+16175550101', leadId), fallback)
  const db = fakeDb()
  assert.equal(await pickCallerId(db, 'invalid', leadId), fallback)
  assert.equal(db.reads.length, 0)
})

test('signed outbound route passes lead context and renders correct caller ID without originating a call', async () => {
  const db = fakeDb({ lead: { state: 'TX', phone: '+16175550101' } })
  const { POST } = loadTs('src/app/api/voice/outbound/route.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => db }, '@/lib/voice': voice,
  })
  const params = { To: '+16175550101', leadId, buyerId: 'test-buyer' }
  const signature = crypto.createHmac('sha1', env.TWILIO_AUTH_TOKEN)
    .update(voice.VOICE_OUTBOUND_URL + Object.keys(params).sort().map(k => k + params[k]).join('')).digest('base64')
  const response = await POST({ text: async () => new URLSearchParams(params).toString(), headers: new Headers({ 'x-twilio-signature': signature }) })
  const xml = await response.text()
  assert.match(xml, /callerId="\+18175550100"/)
  assert.match(xml, />\+16175550101<\/Number>/)
  assert.match(xml, /record="record-from-answer-dual"/)
  assert.match(xml, /\/api\/voice\/whisper/)
  assert.match(xml, /lead_id=11111111-1111-4111-8111-111111111111/)
})

test('unsigned outbound requests still fail before any database access', async () => {
  const { POST } = loadTs('src/app/api/voice/outbound/route.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => { throw Error('must not access database') } }, '@/lib/voice': voice,
  })
  const response = await POST({ text: async () => 'To=%2B15125550101', headers: new Headers() })
  const xml = await response.text()
  assert.match(xml, /Chamada não autorizada/)
  assert.doesNotMatch(xml, /<Dial/)
})
