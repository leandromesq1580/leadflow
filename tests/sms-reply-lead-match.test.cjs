/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness; no application imports or credentials. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const path = require('node:path')
const root = path.resolve(__dirname, '..')

const OLD_LEAD = '245c35de-91a5-49bd-b8bd-3e76fef4db5c' // real lead, buyer Leandro — sent the SMS the client is replying to
const NEW_DUP_LEAD = 'f8ae11b5-8b74-40aa-9c2d-a97d75a4692d' // duplicate lead created later, buyer Davi — never messaged this contact
const BUYER_LEANDRO = '00dcaf5a-aa2d-4bf5-8ea3-a42594e0af1f'
const BUYER_DAVI = '3232760f-becb-4aa9-a0c7-5059cc05fec6'

/**
 * Builds a fake Supabase client. `selectQueues` supplies, per table, the
 * responses for SELECT-type awaited calls (maybeSingle/single/then), in the
 * exact order the route performs them. INSERT/UPDATE calls never consume
 * those queues — they resolve immediately, matching that the route never
 * inspects their result.
 */
function fakeDb(selectQueues) {
  const queues = Object.fromEntries(Object.entries(selectQueues).map(([k, v]) => [k, [...v]]))
  const events = []
  return {
    events,
    from(table) {
      let opType = 'select'
      const q = {
        select: () => q,
        or: () => q,
        eq: (...a) => { events.push({ table, op: 'eq', args: a }); return q },
        in: (...a) => { events.push({ table, op: 'in', args: a }); return q },
        order: () => q,
        limit: () => q,
        insert: (row) => { opType = 'write'; events.push({ table, op: 'insert', row }); return q },
        update: (row) => { opType = 'write'; events.push({ table, op: 'update', row }); return q },
        maybeSingle: () => resolve(),
        single: () => resolve(),
        then: (ok, bad) => resolve().then(ok, bad),
      }
      function resolve() {
        if (opType === 'write') return Promise.resolve({ data: null, error: null })
        const list = queues[table]
        return Promise.resolve(list && list.length ? list.shift() : { data: null, error: null })
      }
      return q
    },
  }
}

function fixture(selectQueues) {
  const db = fakeDb(selectQueues)
  const notify = { groupCalls: [], ownerCalls: [] }
  const m = { exports: {} }
  const src = fs.readFileSync(path.join(root, 'src/app/api/webhook/twilio-sms/route.ts'), 'utf8')
  const req = name => {
    if (name === 'next/server') return { NextResponse: class {} }
    if (name === '@/lib/supabase/admin') return { createAdminClient: () => db }
    if (name === '@/lib/twilio') return { validateTwilioSignature: () => true, isOptOut: () => false }
    if (name === '@/lib/notifications') return {
      notifyGroupSmsReply: async (...a) => { notify.groupCalls.push(a) },
      notifySmsReplyToOwner: async (...a) => { notify.ownerCalls.push(a) },
    }
    if (name === '@/lib/push-notify') return { pushToBuyer: async () => {} }
    if (name === '@/lib/buyer-locale') return { localeDoBuyer: async () => 'pt', trad: () => (pt) => pt }
    throw new Error(`Unexpected import ${name}`)
  }
  new Function('require', 'module', 'exports', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(req, m, m.exports)
  const request = {
    text: async () => 'From=%2B19095550473&To=%2B18885550100&Body=%C3%89+vc+ligando+de+novo%3F&MessageSid=SM_test_reply',
    headers: { get: (name) => name === 'host' ? 'lead4producers.com' : null },
  }
  return { events: db.events, notify, post: () => m.exports.POST(request) }
}

test('SMS reply from a lead with two duplicate records routes to the buyer who actually messaged them, not the newest duplicate', async () => {
  const f = fixture({
    sms_messages: [
      { data: null, error: null }, // dedupe check by twilio_sid: not seen before
      { data: [{ lead_id: OLD_LEAD, created_at: '2026-09-22T22:39:36Z' }], error: null }, // outbound history for the two candidates
    ],
    leads: [
      {
        data: [
          { id: NEW_DUP_LEAD, name: 'Andi Salustiano', assigned_to: BUYER_DAVI, created_at: '2026-04-20T21:51:19Z' },
          { id: OLD_LEAD, name: 'Andi Salustiano', assigned_to: BUYER_LEANDRO, created_at: '2026-04-15T03:58:56Z' },
        ],
        error: null,
      },
    ],
  })
  await f.post()
  assert.equal(f.notify.ownerCalls.length, 1, 'must notify exactly one lead owner')
  assert.equal(f.notify.ownerCalls[0][0], BUYER_LEANDRO, 'must notify the buyer who actually sent the outbound SMS, not the newest duplicate lead')
  const insertedReceived = f.events.find(e => e.table === 'sms_messages' && e.op === 'insert')
  assert.equal(insertedReceived.row.lead_id, OLD_LEAD, 'the inbound reply must be recorded against the lead with the real conversation')
})

test('single matching lead is used directly without querying outbound history', async () => {
  const f = fixture({
    sms_messages: [
      { data: null, error: null }, // dedupe check
    ],
    leads: [
      { data: [{ id: OLD_LEAD, name: 'Andi Salustiano', assigned_to: BUYER_LEANDRO, created_at: '2026-04-15T03:58:56Z' }], error: null },
    ],
  })
  await f.post()
  assert.equal(f.notify.ownerCalls.length, 1)
  assert.equal(f.notify.ownerCalls[0][0], BUYER_LEANDRO)
  const historyLookup = f.events.find(e => e.table === 'sms_messages' && e.op === 'in')
  assert.equal(historyLookup, undefined, 'no ambiguity → no need to query outbound history')
})
