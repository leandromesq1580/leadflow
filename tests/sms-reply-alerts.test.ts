import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { transpileModule, ModuleKind } from 'typescript'

type Row = Record<string, unknown>
function loadRoute(file: string, tables: Record<string, Row[]>, opts: { fail?: string; cap?: number; caller?: { id: string; isAdmin: boolean } | null } = {}) {
  const db = { from(table: string) {
    const filters: ((r: Row) => boolean)[] = []
    let patch: Row | undefined, cap = opts.cap ?? 500
    const q = {
      select() { return q }, eq(k: string, v: unknown) { filters.push(r => r[k] === v); return q },
      is(k: string, v: unknown) { filters.push(r => (r[k] ?? null) === v); return q },
      not(k: string, _op: string, v: unknown) { filters.push(r => r[k] !== v); return q },
      in(k: string, vs: unknown[]) { filters.push(r => vs.includes(r[k])); return q },
      gt(k: string, v: string) { filters.push(r => String(r[k]) > v); return q },
      order() { return q }, limit(n: number) { cap = Math.min(cap, n); return q },
      update(value: Row) { patch = value; return q },
      then(on: (v: unknown) => unknown) {
        if (opts.fail === table) return Promise.resolve({ data: null, error: { message: 'synthetic failure' } }).then(on)
        const data = (tables[table] || []).filter(r => filters.every(f => f(r))).sort((a,b) => String(a.id).localeCompare(String(b.id)))
        if (patch) data.forEach(r => Object.assign(r, patch))
        return Promise.resolve({ data: data.slice(0, cap), error: null }).then(on)
      },
    }
    return q
  } }
  const caller = 'caller' in opts ? opts.caller : { id: 'buyer', isAdmin: false }
  const deps: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (b: unknown, o?: ResponseInit) => Response.json(b, o) } },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/api-auth': { callerBuyer: async () => caller, canActAs: (c: {id: string}, id: string) => c.id === id },
    '@/lib/lead-ownership': { assertBuyerOwnsLead: async (_db: unknown, _b: string, id: string) => ({ ok: id === 'lead' }) },
    '@/lib/lead-message-locale': { leadMessageLocale: () => 'pt' },
    '@/lib/send-guard': {}, '@/lib/wa-bridge': {}, '@/lib/template-render': {},
  }
  function load(path: string): Record<string, (req: Request) => Promise<Response>> {
    const code = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
    const mod = { exports: {} }
    new Function('require', 'module', 'exports', code)((name: string) => {
      if (name in deps) return deps[name]
      const target = name.startsWith('@/') ? resolve('src', name.slice(2)) : resolve(dirname(path), name)
      if (existsSync(target + '.ts')) return load(target + '.ts')
      throw new Error(name)
    }, mod, mod.exports)
    return mod.exports
  }
  return load(resolve(file))
}
const sms = (id: string, extra: Row = {}) => ({ id, lead_id: 'lead', buyer_id: 'buyer', direction: 'in', body: 'Resposta SMS', created_at: '2026-10-12T10:00:00Z', read_at: null, ...extra })
const unreadPath = 'src/app/api/whatsapp/unread/route.ts'
const url = 'https://local.invalid/?buyer_id=buyer'

test('SMS-only unread, pagination and owner isolation; outbound/read excluded', async () => {
  const api = loadRoute(unreadPath, { sms_inbox_messages: [sms('01'), sms('02'), sms('03', { buyer_id: 'other' }), sms('04', { read_at: 'date' }), sms('05', { direction: 'out' })] }, { cap: 1 })
  const res = await api.GET(new Request(url))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body.smsCounts, { lead: 2 })
  assert.deepEqual(body.counts, { lead: 2 })
  assert.equal(body.total, 2)
})
test('mixed unread keeps separate channel counts and total', async () => {
  const api = loadRoute(unreadPath, { sms_inbox_messages: [sms('01')], whatsapp_messages: [{ ...sms('wa'), body: 'WA' }] })
  const body = await (await api.GET(new Request(url))).json()
  assert.deepEqual(body.whatsappCounts, { lead: 1 })
  assert.deepEqual(body.smsCounts, { lead: 1 })
  assert.equal(body.total, 2)
})
test('SMS unavailable does not report a false zero', async () => {
  const api = loadRoute(unreadPath, {}, { fail: 'sms_inbox_messages' })
  assert.equal((await api.GET(new Request(url))).status, 503)
})
test('SMS-only lead appears in conversations with channel and unread', async () => {
  const api = loadRoute('src/app/api/whatsapp/conversations/route.ts', { sms_inbox_messages: [sms('01')], leads: [{ id: 'lead', name: 'Synthetic' }] })
  const body = await (await api.GET(new Request(url))).json()
  assert.equal(body.conversations.length, 1)
  assert.equal(body.conversations[0].sms_unread, 1)
  assert.equal(body.conversations[0].last_channel, 'sms')
})
test('mark-read acknowledges only displayed SMS IDs, never unseen arrivals or another lead', async () => {
  const rows = [sms('00000000-0000-4000-8000-000000000001'), sms('00000000-0000-4000-8000-000000000002'), sms('00000000-0000-4000-8000-000000000003', { lead_id: 'other' })]
  const api = loadRoute('src/app/api/whatsapp/messages/route.ts', { sms_messages: rows, sms_inbox_messages: rows })
  const res = await api.PATCH(new Request(url, { method: 'PATCH', body: JSON.stringify({ lead_id: 'lead', sms_ids: [rows[0].id, rows[2].id] }) }))
  assert.equal(res.status, 200)
  assert.ok(rows[0].read_at)
  assert.equal(rows[1].read_at, null)
  assert.equal(rows[2].read_at, null)
})
test('SMS read persistence failure is not reported as success', async () => {
  const api = loadRoute('src/app/api/whatsapp/messages/route.ts', { sms_inbox_messages: [sms('00000000-0000-4000-8000-000000000001')] }, { fail: 'sms_messages' })
  assert.equal((await api.PATCH(new Request(url, { method: 'PATCH', body: JSON.stringify({ lead_id: 'lead', sms_ids: ['00000000-0000-4000-8000-000000000001'] }) }))).status, 503)
})
test('thread includes SMS beyond 200 and preserves the receipt state', async () => {
  const rows = Array.from({length: 205}, (_, i) => sms(String(i).padStart(4, '0'), {status: 'received'}))
  const api = loadRoute('src/app/api/whatsapp/messages/route.ts', {sms_messages: rows}, {cap: 50})
  const res = await api.GET(new Request(url + '&lead_id=lead'))
  assert.equal(res.status, 200)
  const {messages} = await res.json()
  assert.equal(messages.length, 205)
  assert.equal(messages[204].id, 'sms-0204')
  assert.equal(messages[204].read_at, null)
})
test('failed SMS thread read is explicitly unavailable, not an empty successful conversation', async () => {
  const api = loadRoute('src/app/api/whatsapp/messages/route.ts', {}, {fail: 'sms_messages'})
  assert.equal((await api.GET(new Request(url + '&lead_id=lead'))).status, 503)
})
for (const caller of [null, {id: 'other', isAdmin: false}]) test('unread rejects missing/foreign session', async () => {
  const api = loadRoute(unreadPath, {}, { caller })
  assert.equal((await api.GET(new Request(url))).status, caller ? 403 : 401)
})
