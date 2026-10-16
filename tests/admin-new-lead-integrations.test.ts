import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { createClient } from '@supabase/supabase-js'
import * as language from '../src/lib/lead-message-locale'
import * as twilio from '../src/lib/twilio'

// Compile the actual modules. Only database/network IO is replaced; the Supabase
// serializer, eligibility, templates, reservation and dispatch code are real.
function load(file: string, dependencies: Record<string, unknown>) {
  const compiled = transpileModule(readFileSync(`src/lib/${file}.ts`, 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} as Record<string, (...args: unknown[]) => Promise<unknown>> }
  new Function('require', 'module', 'exports', compiled)((id: string) => {
    assert.ok(id in dependencies, `Unexpected dependency ${id}`)
    return dependencies[id]
  }, loaded, loaded.exports)
  return loaded.exports
}

// Synthetic PostgREST rows intentionally span multiple unrelated table schemas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
type Request = { table: string; method: string; url: URL; body: Row | null }
function database(tables: Record<string, Row[]>) {
  const requests: Request[] = []
  let counter = 0
  const io: { before(request: Request): Promise<Response | void>; after(request: Request, rows: Row[]): Promise<void> } = {
    before: async () => {},
    after: async () => {},
  }
  const db = createClient('https://database.example.invalid', 'fixture-only', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)), table = url.pathname.split('/').pop()!
      const method = init?.method || 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : null
      const req = { table, method, url, body }; requests.push(req)
      const interception = await io.before(req)
      if (interception) return interception
      const matches = (row: Row) => [...url.searchParams].every(([key, filter]) => {
        if (['select', 'order', 'limit', 'offset'].includes(key)) return true
        const dot = filter.indexOf('.'), op = filter.slice(0, dot), value = filter.slice(dot + 1)
        if (op === 'eq') return String(row[key]) === value
        if (op === 'in') return value.slice(1, -1).split(',').includes(String(row[key]))
        if (op === 'is') return value === 'null' ? row[key] == null : String(row[key]) === value
        if (op === 'gte') return row[key] >= value
        if (op === 'lte') return row[key] <= value
        if (op === 'like') return String(row[key]).startsWith(value.replace(/[%*]$/, ''))
        throw new Error(`Unsupported fixture filter ${filter}`)
      })
      let rows = (tables[table] || []).filter(matches)
      if (method === 'POST') {
        const record = { id: `insert-${++counter}`, created_at: new Date().toISOString(), ...body }
        // Model migration071's reservation trigger; SQL is exercised separately.
        if (table === 'sms_messages' && ['sending', 'scheduled', 'queued'].includes(record.status)
          && tables.leads.some(l => l.id === record.lead_id && l.redelivered_to_lead_id)) return failure('source_redelivered')
        ;(tables[table] ||= []).push(record); rows = [record]
      } else if (method === 'PATCH') {
        if (table === 'sms_messages' && ['sending', 'scheduled', 'queued'].includes(body?.status)
          && rows.some(r => tables.leads.some(l => l.id === r.lead_id && l.redelivered_to_lead_id))) return failure('source_redelivered')
        rows.forEach(row => Object.assign(row, body))
      }
      const count = rows.length
      rows = structuredClone(rows.slice(0, Number(url.searchParams.get('limit') || rows.length)))
      const select = url.searchParams.get('select')
      if (select && select !== '*') rows = rows.map(r => Object.fromEntries(select.split(',').map(k => [k, r[k] ?? null])))
      await io.after(req, rows)
      const single = new Headers(init?.headers).get('Accept')?.includes('vnd.pgrst.object')
      if (single && rows.length !== 1) return new Response(JSON.stringify({ code: 'PGRST116', message: 'Expected one row' }), { status: 406 })
      return new Response(method === 'HEAD' ? null : JSON.stringify(single ? rows[0] : rows), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': `0-${Math.max(count - 1, 0)}/${count}` },
      })
    } },
  })
  return { db, tables, requests, io }
}
function failure(message: string) { return Response.json({ message, code: 'FIXTURE' }, { status: 400 }) }
const buyer = { id: 'buyer', name: 'Fixture Buyer', email: 'fixture@example.invalid', phone: '15555550102' }
const contact = { id: 'lead', name: 'Fixture Lead', phone: '15555550101', city: 'Fixture', state: 'FL', interest: 'Life' }
const canonical = () => ({ ...contact, assigned_to: 'buyer', assigned_to_member: 'member', meta_lead_id: null,
  lead_language: 'es', redelivery_source_id: 'source', redelivered_to_lead_id: null, notified_at: null, delivery_credit_id: 'credit' })
const ledger = () => ({ lead_id: 'lead', buyer_id: 'buyer', source_lead_id: 'source', credit_id: 'credit' })
function notifications(t: TestContext, lead: Row | null = canonical(), receipt: Row | null = ledger()) {
  const f = database({ leads: lead ? [lead] : [], admin_new_lead_assignments: receipt ? [receipt] : [] })
  const sends: Row[] = []
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, 'https://bridge.example.invalid/send')
    sends.push({ channel: 'whatsapp', ...JSON.parse(String(options.body)) })
    return Response.json({ success: true, id: 'fixture-confirmation' })
  })
  const old = process.env.WA_BRIDGE_URL
  process.env.WA_BRIDGE_URL = 'https://bridge.example.invalid'
  t.after(() => { if (old === undefined) delete process.env.WA_BRIDGE_URL; else process.env.WA_BRIDGE_URL = old })
  const api = load('notifications', {
    resend: { Resend: class { emails = { send: async (body: Row) => { sends.push({ channel: 'email', ...body }); return { error: null } } } } },
    './buyer-locale': { localeDoBuyer: async () => 'pt', trad: () => (pt: string) => pt },
    './insurance-policies': {}, './lead-message-locale': language,
    '@/lib/supabase/admin': { createAdminClient: () => f.db },
    '@/lib/push-notify': { pushToBuyer: async () => { sends.push({ channel: 'push' }); return 1 } },
    '@/lib/wa-bridge': { pickFallbackBridge: async () => null },
  })
  return { ...f, api, sends }
}

test('notifier permits a ledger-proven clone and respects canonical notified_at on replay', async t => {
  const f = notifications(t)
  assert.equal(await f.api.sendLeadNotificationEmail(buyer, { ...contact, notified_at: 'stale-caller' }), true)
  assert.ok(f.sends.some(s => s.channel === 'email'))
  assert.ok(f.sends.some(s => s.channel === 'push'))
  assert.ok(f.sends.some(s => s.channel === 'whatsapp' && s.number === buyer.phone))
  assert.ok(f.tables.leads[0].notified_at)
  const count = f.sends.length
  assert.equal(await f.api.sendLeadNotificationEmail(buyer, contact), true)
  assert.equal(f.sends.length, count)
})

for (const scenario of ['manual', 'forged', 'ledger-error', 'ledger-throw', 'lead-error', 'lead-throw', 'missing', 'missing-id', 'wrong-owner', 'wrong-ledger-owner', 'wrong-source', 'wrong-credit', 'retired', 'retired-meta', 'forged-meta', 'already-notified'] as const) {
  test(`notifier guard: ${scenario}`, async t => {
    let source: Row | null = canonical(), receipt: Row | null = ledger()
    if (scenario === 'manual') source = { ...source, redelivery_source_id: null }
    if (scenario === 'forged' || scenario === 'forged-meta') receipt = null
    if (scenario === 'forged-meta') source.meta_lead_id = 'forged-meta'
    if (scenario === 'missing') source = null
    if (scenario === 'wrong-owner') source!.assigned_to = 'other'
    if (scenario === 'wrong-ledger-owner') receipt!.buyer_id = 'other'
    if (scenario === 'wrong-source') receipt!.source_lead_id = 'other'
    if (scenario === 'wrong-credit') receipt!.credit_id = 'other'
    if (scenario.startsWith('retired')) source!.redelivered_to_lead_id = 'next'
    if (scenario === 'retired-meta') Object.assign(source!, { meta_lead_id: 'meta', redelivery_source_id: null })
    if (scenario === 'already-notified') source!.notified_at = '2026-01-01T00:00:00Z'
    const f = notifications(t, source, receipt)
    f.io.before = async r => {
      const table = scenario.startsWith('ledger') ? 'admin_new_lead_assignments' : 'leads'
      if (r.table === table && scenario.endsWith('-error')) return failure('read_unavailable')
      if (r.table === table && scenario.endsWith('-throw')) throw new Error('fixture read transport error')
    }
    const result = await f.api.sendLeadNotificationEmail(buyer, scenario === 'missing-id' ? { ...contact, id: undefined } : contact)
    assert.equal(result, scenario === 'already-notified')
    assert.deepEqual(f.sends, [])
    assert.ok(f.requests.every(r => r.method === 'GET'), 'rejected guard must not write')
  })
}

for (const failureMode of ['stamp-error', 'stamp-throw', 'stamp-missing', 'stamp-owner-change', 'buyer-transport']) {
  test(`clone notification quarantines unconfirmed ${failureMode}`, async t => {
    const f = notifications(t)
    if (failureMode === 'buyer-transport') t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
      const payload = JSON.parse(String(options.body))
      f.sends.push({ channel: 'whatsapp', ...payload })
      return Response.json(payload.number !== buyer.phone ? { success: true, id: 'fixture-confirmation' } : { success: false })
    })
    f.io.before = async r => {
      if (r.method !== 'PATCH') return
      if (failureMode === 'stamp-error') return failure('stamp_unavailable')
      if (failureMode === 'stamp-throw') throw new Error('stamp_unavailable')
      if (failureMode === 'stamp-missing') return Response.json(null)
      if (failureMode === 'stamp-owner-change') f.tables.leads[0].assigned_to = 'other'
    }
    assert.equal(await f.api.sendLeadNotificationEmail(buyer, contact), false)
    assert.ok(f.sends.length > 0, 'transport was attempted, not a preflight rejection')
    assert.equal(f.tables.leads[0].notified_at, null)
  })
}

test('notified clone still rejects a stale recipient and missing caller buyer ID', async t => {
  const f = notifications(t, { ...canonical(), notified_at: '2026-01-01T00:00:00Z' })
  for (const id of ['other', undefined]) assert.equal(await f.api.sendLeadNotificationEmail({ ...buyer, id }, contact), false)
  assert.deepEqual(f.sends, [])
})

for (const scenario of ['manual', 'retired', 'missing', 'error']) {
  test(`team notifier also fails closed: ${scenario}`, async t => {
    const source: Row = { ...canonical(), meta_lead_id: 'meta', redelivery_source_id: null }
    if (scenario === 'manual') source.meta_lead_id = null
    if (scenario === 'retired') source.redelivered_to_lead_id = 'clone'
    const f = notifications(t, scenario === 'missing' ? null : source, null)
    if (scenario === 'error') f.io.before = async () => failure('read_unavailable')
    await f.api.sendTeamMemberNotification({ ...buyer, id: 'member', whatsapp: buyer.phone }, contact)
    assert.deepEqual(f.sends, [])
  })
}

function sms(t: TestContext, scheduled = true) {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-07T16:00:00Z') })
  const f = database({ leads: [{ ...canonical(), redelivery_source_id: null, sms_opted_out: false }],
    buyers: [buyer], follow_ups: [], whatsapp_messages: [], sms_messages: scheduled ? [{ id: 'sms', lead_id: 'lead', direction: 'out', status: 'scheduled',
      to_phone: '15555550101', body: 'Old copy', scheduled_for: '2026-09-07T15:00:00Z' }] : [] })
  const sends: Row[] = []
  const transport = { send: async (phone: string, body: string): Promise<Row> => {
    sends.push({ phone, body })
    assert.ok(f.tables.sms_messages.some(r => r.status === 'sending'), 'reservation must exist BEFORE transport')
    return { ok: true, sid: 'fixture-sid' }
  } }
  const api = () => load('sms-auto', {
    './supabase/admin': { createAdminClient: () => f.db },
    './twilio': { ...twilio, sendSms: (phone: string, body: string) => transport.send(phone, body) },
    './availability': { buyerTimezone: () => 'America/New_York' }, './lead-message-locale': language,
    './lead-message-template': { translateLeadCopy: async (_db: unknown, _copy: unknown, locale: string) => ({ body: `translated-${locale}`, subject: null }) },
  })
  return { ...f, sends, transport, api }
}

function barrier(size: number) {
  let arrived = 0, release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return async () => { if (++arrived === size) release(); await promise }
}

test('two independently compiled dispatchers claim the same scheduled SMS only once', async t => {
  const f = sms(t), meet = barrier(2)
  f.io.after = async r => { if (r.table === 'sms_messages' && r.url.searchParams.has('scheduled_for') && r.method === 'GET') await meet() }
  const results = await Promise.all([f.api().dispatchScheduledSms(), f.api().dispatchScheduledSms()])
  assert.deepEqual(results.sort(), [0, 1])
  assert.equal(f.sends.length, 1)
  assert.equal(f.tables.sms_messages[0].status, 'sent')
  assert.equal(f.tables.follow_ups.length, 1)
  assert.equal(f.sends[0].body, 'translated-es')
})

for (const phase of ['after-batch', 'before-claim']) {
  test(`source retirement ${phase} prevents scheduled transport`, async t => {
    const f = sms(t)
    const retire = () => { f.tables.leads[0].redelivered_to_lead_id = 'clone'; f.tables.sms_messages[0].status = 'canceled' }
    if (phase === 'after-batch') f.io.after = async r => { if (r.method === 'GET' && r.url.searchParams.has('scheduled_for')) retire() }
    else f.io.before = async r => { if (r.method === 'PATCH' && r.body?.status === 'sending') retire() }
    assert.equal(await f.api().dispatchScheduledSms(), 0)
    assert.deepEqual(f.sends, [])
    assert.equal(f.tables.sms_messages[0].status, 'canceled')
  })
}

for (const path of ['immediate', 'scheduled']) {
  for (const failureMode of ['claim-error', 'claim-throw', 'transport-false', 'transport-throw', 'transport-no-sid', 'note-error', 'finish-error', 'finish-committed-error', 'quarantine-error']) {
    test(`${path}: ${failureMode} never silently retries or releases an uncertain reservation`, async t => {
      const f = sms(t, path === 'scheduled')
      f.io.before = async r => {
        const reserve = r.table === 'sms_messages' && r.body?.status === 'sending'
        if (reserve && failureMode === 'claim-error') return failure('reservation_unavailable')
        if (reserve && failureMode === 'claim-throw') throw new Error('reservation_unavailable')
        if (r.method === 'POST' && r.table === 'follow_ups' && failureMode === 'note-error') return failure('note_unavailable')
        if (r.body?.status === 'sent' && failureMode.startsWith('finish-')) {
          if (failureMode === 'finish-committed-error') Object.assign(f.tables.sms_messages[0], r.body)
          return failure('finish_unavailable')
        }
        if (r.body?.status === 'unknown' && failureMode === 'quarantine-error') return failure('quarantine_unavailable')
      }
      const real = f.transport.send
      f.transport.send = async (phone, body) => {
        await real(phone, body)
        if (failureMode === 'transport-throw') throw new Error('response lost after send')
        if (failureMode === 'transport-false' || failureMode === 'quarantine-error') return { ok: false, error: 'response lost' }
        if (failureMode === 'transport-no-sid') return { ok: true }
        return { ok: true, sid: 'fixture-sid' }
      }
      const run = () => path === 'scheduled' ? f.api().dispatchScheduledSms() : f.api().sendOrScheduleAutoSms(f.db, 'lead', 'buyer')
      await run()
      if (failureMode.startsWith('claim')) { assert.deepEqual(f.sends, []); return }
      assert.equal(f.sends.length, 1)
      assert.ok(['sending', 'unknown'].includes(f.tables.sms_messages[0].status))
      await run()
      assert.equal(f.sends.length, 1, 'a fresh module/worker must not resend uncertain delivery')
      assert.ok(f.requests.every(r => r.body?.status !== 'failed'), 'transport uncertainty is not a proven failure')
    })
  }
}

for (const path of ['immediate', 'scheduled']) {
  test(`${path}: reservation committed but response lost never sends or clears the fence`, async t => {
    const f = sms(t, path === 'scheduled')
    f.io.before = async r => {
      if (r.table !== 'sms_messages' || r.body?.status !== 'sending') return
      if (r.method === 'POST') f.tables.sms_messages.push({ id: 'uncertain-claim', ...r.body })
      else f.tables.sms_messages[0].status = 'sending'
      return failure('claim_response_lost')
    }
    const run = () => path === 'scheduled' ? f.api().dispatchScheduledSms() : f.api().sendOrScheduleAutoSms(f.db, 'lead', 'buyer')
    await run(); await run()
    assert.deepEqual(f.sends, [])
    assert.equal(f.tables.sms_messages.length, 1)
    assert.equal(f.tables.sms_messages[0].status, 'sending')
  })
}

test('a stale preflight cancellation cannot clear another dispatcher sending reservation', async t => {
  const f = sms(t)
  f.tables.leads[0].sms_opted_out = true
  f.io.before = async r => { if (r.table === 'sms_messages' && r.body?.status === 'canceled') f.tables.sms_messages[0].status = 'sending' }
  assert.equal(await f.api().dispatchScheduledSms(), 0)
  assert.deepEqual(f.sends, [])
  assert.equal(f.tables.sms_messages[0].status, 'sending')
})

for (const phase of ['before-read', 'before-reserve']) {
  test(`immediate path refuses retired source ${phase}`, async t => {
    const f = sms(t, false)
    if (phase === 'before-read') f.tables.leads[0].redelivered_to_lead_id = 'clone'
    else f.io.before = async r => { if (r.table === 'sms_messages' && r.method === 'POST') f.tables.leads[0].redelivered_to_lead_id = 'clone' }
    assert.equal(await f.api().sendOrScheduleAutoSms(f.db, 'lead', 'buyer'), 'skipped')
    assert.deepEqual(f.sends, [])
  })
}

test('immediate normal path reserves, sends localized copy and persists history once', async t => {
  const f = sms(t, false), api = f.api()
  assert.equal(await api.sendOrScheduleAutoSms(f.db, 'lead', 'buyer'), 'sent')
  assert.equal(f.sends.length, 1)
  assert.equal(f.sends[0].body, api.buildSmsBody(contact.name, buyer.name, 'es'))
  assert.equal(f.tables.sms_messages[0].status, 'sent')
  assert.equal(f.tables.follow_ups.length, 1)
  assert.equal(await api.sendOrScheduleAutoSms(f.db, 'lead', 'buyer'), 'skipped')
})

for (const path of ['immediate', 'scheduled']) for (const guard of ['optout', 'daily', 'total', 'window', 'language', 'pending-read-error']) {
  test(`${path} preserves ${guard} guard`, async t => {
    const f = sms(t, path === 'scheduled')
    if (guard === 'optout') f.tables.leads[0].sms_opted_out = true
    if (guard === 'daily') f.tables.follow_ups.push({ lead_id: 'lead', description: '📱 SMS auto fixture', created_at: '2026-09-07T15:00:00Z' })
    if (guard === 'total') for (let i = 0; i < 14; i++) f.tables.follow_ups.push({ lead_id: 'lead', description: '📱 SMS auto fixture', created_at: '2026-08-01T15:00:00Z' })
    if (guard === 'window') t.mock.timers.setTime(new Date('2026-09-08T02:00:00Z').getTime())
    if (guard === 'language') f.tables.leads[0].lead_language = null
    if (guard === 'pending-read-error') f.io.before = async r => { if (r.table === 'sms_messages' && r.method === 'GET') return failure('read_unavailable') }
    const run = () => path === 'scheduled' ? f.api().dispatchScheduledSms() : f.api().sendOrScheduleAutoSms(f.db, 'lead', 'buyer')
    if (guard === 'language' && path === 'immediate') await assert.rejects(run(), /\[lead-language\]/)
    else await run()
    assert.deepEqual(f.sends, [])
    if (guard === 'window') assert.equal(f.tables.sms_messages[0].status, 'scheduled')
  })
}

test('dispatcher cancels a scheduled message if the lead answered', async t => {
  const f = sms(t)
  f.tables.whatsapp_messages.push({ lead_id: 'lead', direction: 'in', sent_at: '2026-09-07T15:30:00Z' })
  assert.equal(await f.api().dispatchScheduledSms(), 0)
  assert.deepEqual(f.sends, [])
  assert.equal(f.tables.sms_messages[0].status, 'canceled')
})
