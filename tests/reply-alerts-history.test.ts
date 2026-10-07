import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { ModuleKind, transpileModule } from 'typescript'

// Real route code with only the network/auth boundaries replaced.
function route(file: string, tables: Record<string, Record<string, unknown>[]>, pageCap = 1000, failTable = '', metadata: { failAt?: number; maxIn?: number; broken?: 'repeat' | 'reverse'; trace?: { ids: unknown[]; after: string | null; count: number }[] } = {}) {
  let metadataCalls = 0
  const db = { from(table: string) {
    const filters: ((r: Record<string, unknown>) => boolean)[] = []
    let sort = 'id', asc = true, cap = pageCap
    let ids: unknown[] = [], after: string | null = null
    const isMetadata = table === 'leads' || table === 'buyers'
    const q = {
      select() { return q },
      eq(k: string, v: unknown) { filters.push(r => r[k] === v); return q },
      is(k: string, v: unknown) { filters.push(r => (r[k] ?? null) === v); return q },
      not(k: string, op: string, v: unknown) { filters.push(r => op === 'is' ? r[k] != null : r[k] !== v); return q },
      in(k: string, v: unknown[]) { ids = v; filters.push(r => v.includes(r[k])); return q },
      gt(k: string, v: string) { after = v; if (!(isMetadata && metadata.broken === 'repeat')) filters.push(r => String(r[k]) > v); return q },
      order(k: string, o?: { ascending?: boolean }) { sort = k; asc = o?.ascending !== false; return q },
      limit(n: number) { cap = Math.min(pageCap, n); return q },
      single: async () => ({ data: { is_admin: true }, error: null }),
      then(on: (v: unknown) => unknown, fail?: (e: unknown) => unknown) {
        const data = (tables[table] || []).filter(r => filters.every(f => f(r)))
          .sort((a, b) => String(a[sort]).localeCompare(String(b[sort])) * (asc ? 1 : -1)).slice(0, cap)
        if (isMetadata) {
          metadataCalls++
          metadata.trace?.push({ ids: [...ids], after, count: data.length })
          if (metadata.broken === 'reverse') data.reverse()
          if (metadataCalls === metadata.failAt || ids.length > (metadata.maxIn ?? Infinity)) {
            return Promise.resolve({ data: null, error: { message: 'synthetic metadata unavailable' } }).then(on, fail)
          }
        }
        return Promise.resolve(table === failTable ? { data: null, error: { message: 'synthetic unavailable' } } : { data, error: null }).then(on, fail)
      },
    }
    return q
  } }
  const deps: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (b: unknown, o?: ResponseInit) => Response.json(b, o) } },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth' } } }) } }) },
    '@/lib/api-auth': { callerBuyer: async () => ({ id: 'buyer', isAdmin: false }), canActAs: (_c: unknown, id: string) => id === 'buyer' },
    '@/lib/lead-message-locale': { leadMessageLocale: () => 'pt' },
    '@/lib/wa-bridge': {},
    '@/lib/send-guard': {},
    '@/lib/template-render': {},
    '@/lib/lead-ownership': { assertBuyerOwnsLead: async () => ({ ok: true }) },
  }
  function load(path: string): Record<string, (...a: unknown[]) => Promise<Response>> {
    const output = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
    const mod = { exports: {} }
    new Function('require', 'module', 'exports', output)((name: string) => {
      if (name in deps) return deps[name]
      const target = name.startsWith('@/') ? resolve('src', name.slice(2)) : resolve(dirname(path), name)
      if (existsSync(target + '.ts')) return load(target + '.ts')
      throw new Error('Unexpected import ' + name)
    }, mod, mod.exports)
    return mod.exports
  }
  return load(resolve(file))
}
const empty = { id: '01', buyer_id: 'buyer', lead_id: 'lead', client_buyer_id: 'buyer', direction: 'in', body: '', media_type: null, media_url: null, read_at: null, sent_at: '2026-10-06T19:53:16Z', created_at: '2026-10-06T19:53:16Z', wa_message_id: 'false_technical', status: 'delivered' }
const message = (change: Record<string, unknown>) => ({ ...empty, ...change })

test('historical empty technical event contributes zero to unread badge', async () => {
  const api = route('src/app/api/whatsapp/unread/route.ts', { whatsapp_messages: [empty] })
  const res = await api.GET(new Request('https://local.invalid/api/whatsapp/unread?buyer_id=buyer'))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { counts: {}, total: 0 })
})

test('unread counts only actual replies, preserves pending media, and reads beyond server page cap', async () => {
  const rows = [empty, message({ id: '02', body: '👍' }), message({ id: '03', media_type: 'audio' }), message({ id: '04', body: 'outbound', direction: 'out', wa_message_id: 'true_out' }), message({ id: '05', body: 'own echo', wa_message_id: 'true_echo' }), message({ id: '06', body: 'real reply' })]
  const api = route('src/app/api/whatsapp/unread/route.ts', { whatsapp_messages: rows }, 2)
  const res = await api.GET(new Request('https://local.invalid/api/whatsapp/unread?buyer_id=buyer'))
  assert.deepEqual(await res.json(), { counts: { lead: 3 }, total: 3 })
})

for (const admin of [false, true]) {
  for (const scenario of ['chunks', 'empty', 'removed', 'second-page-error', 'later-block-error', 'repeat', 'reverse'] as const) {
    test(`R3 ${admin ? 'client' : 'lead'} metadata ${scenario}`, async () => {
      const many = scenario === 'chunks' || scenario === 'later-block-error'
      const ids = Array.from({ length: many ? 205 : 2 }, (_, i) => String(i).padStart(4, '0'))
      const rows = ids.map(id => message({ id, lead_id: id, client_buyer_id: id, body: 'real reply' }))
      const records = (scenario === 'empty' ? [] : scenario === 'removed' ? ids.slice(0, 1) : ids).map(id => ({ id, name: `Name ${id}` })).reverse()
      const trace: { ids: unknown[]; after: string | null; count: number }[] = []
      const api = route(`src/app/api/${admin ? 'admin/clients' : 'whatsapp'}/conversations/route.ts`, {
        whatsapp_messages: rows, client_messages: rows, leads: records, buyers: records,
      }, scenario === 'second-page-error' || scenario === 'repeat' ? 1 : many ? 37 : 1000, '', {
        trace, maxIn: 100,
        failAt: scenario === 'second-page-error' ? 2 : scenario === 'later-block-error' ? 5 : undefined,
        broken: scenario === 'repeat' || scenario === 'reverse' ? scenario : undefined,
      })
      const res = await api.GET(new Request('https://local.invalid/?buyer_id=buyer'))
      const body = await res.json()
      const unavailable = ['second-page-error', 'later-block-error', 'repeat', 'reverse'].includes(scenario)
      assert.equal(res.status, unavailable ? 503 : 200)
      if (unavailable) {
        assert.equal(body.conversations, undefined, 'never expose a partial list')
        assert.equal(body.error, 'Conversations unavailable')
      } else {
        const expected = scenario === 'empty' ? [] : scenario === 'removed' ? ids.slice(0, 1) : ids
        assert.deepEqual(body.conversations.map((c: Record<string, unknown>) => c[admin ? 'buyer_id' : 'lead_id']), expected)
        assert.equal(trace.at(-1)?.count, 0, 'must request the empty terminal page')
        if (many) {
          assert.ok(trace.every(q => q.ids.length <= 100))
          assert.equal(trace.filter(q => q.after === null).length, 3)
          assert.equal(trace.filter(q => q.count === 0).length, 3)
        }
      }
    })
  }
  test(`R3 ${admin ? 'client' : 'lead'} metadata continues past a short server page`, async () => {
    const rows = ['a', 'b'].map((id, i) => message({ id: String(i + 1), lead_id: id, client_buyer_id: id, body: 'real reply' }))
    const api = route(`src/app/api/${admin ? 'admin/clients' : 'whatsapp'}/conversations/route.ts`, {
      whatsapp_messages: rows, client_messages: rows, leads: [{ id: 'a' }, { id: 'b' }], buyers: [{ id: 'a' }, { id: 'b' }],
    }, 1)
    const res = await api.GET(new Request('https://local.invalid/?buyer_id=buyer'))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.conversations.length, 2)
    assert.deepEqual(body.conversations.map((c: Record<string, unknown>) => c[admin ? 'buyer_id' : 'lead_id']), ['a', 'b'])
  })
  for (const endpoint of ['messages', 'conversations']) {
    test(`${admin ? 'client' : 'lead'} ${endpoint} preserves messages with null timestamps`, async () => {
      const rows = [message({ body: 'dated' }), message({ id: '02', body: 'undated', sent_at: null, created_at: null })]
      const api = route(`src/app/api/${admin ? 'admin/clients' : 'whatsapp'}/${endpoint}/route.ts`, { whatsapp_messages: rows, client_messages: rows, leads: [{ id: 'lead' }], buyers: [{ id: 'buyer' }] })
      const res = await api.GET(new Request('https://local.invalid/?buyer_id=buyer&lead_id=lead'))
      assert.equal(res.status, 200)
      const body = await res.json()
      if (endpoint === 'messages') assert.equal(body.messages.length, 2)
      else assert.equal(body.conversations[0].last_body, 'dated')
    })
  }
  test(`${admin ? 'client' : 'lead'} metadata failure is explicitly unavailable`, async () => {
    const rows = [message({ body: 'real' })]
    const api = route(`src/app/api/${admin ? 'admin/clients' : 'whatsapp'}/conversations/route.ts`, { whatsapp_messages: rows, client_messages: rows }, 1000, admin ? 'buyers' : 'leads')
    const res = await api.GET(new Request('https://local.invalid/?buyer_id=buyer'))
    assert.equal(res.status, 503)
  })
  test(`${admin ? 'client' : 'lead'} thread hides technical timestamp-only bubbles, keeps real inbound and outbound`, async () => {
    const rows = [empty, message({ id: '02', body: 'Hi', direction: 'out', wa_message_id: 'true_out' }), message({ id: '03', media_type: 'ptt' })]
    const api = route(admin ? 'src/app/api/admin/clients/messages/route.ts' : 'src/app/api/whatsapp/messages/route.ts', { whatsapp_messages: rows, client_messages: rows })
    const res = await api.GET(new Request('https://local.invalid/?buyer_id=buyer&lead_id=lead'))
    const { messages } = await res.json()
    assert.deepEqual(messages.map((m: { id: string }) => m.id), ['02', '03'])
  })
  test(`${admin ? 'client' : 'lead'} conversation does not show empty incoming event as a reply or latest time`, async () => {
    const older = message({ id: '02', body: 'My outgoing message', direction: 'out', wa_message_id: 'true_out', sent_at: '2026-10-06T19:50:00Z', created_at: '2026-10-06T19:50:00Z' })
    const api = route(admin ? 'src/app/api/admin/clients/conversations/route.ts' : 'src/app/api/whatsapp/conversations/route.ts', { whatsapp_messages: [empty, older], client_messages: [empty, older], leads: [{ id: 'lead', name: 'Synthetic lead' }], buyers: [{ id: 'buyer', name: 'Synthetic buyer' }] })
    const res = await api.GET(new Request('https://local.invalid/?buyer_id=buyer'))
    const { conversations } = await res.json()
    assert.equal(conversations.length, 1)
    assert.equal(conversations[0].unread, 0)
    assert.equal(conversations[0].last_direction, 'out')
    assert.equal(conversations[0].last_body, 'My outgoing message')
    assert.equal(conversations[0][admin ? 'last_at' : 'last_sent_at'], '2026-10-06T19:50:00Z')
  })
}
