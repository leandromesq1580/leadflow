import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import ts from 'typescript'
import { validateAIConfig, nextSendAt } from '../src/lib/ai-sequence-config'

const buyer = '11111111-1111-4111-8111-111111111111'
const sequence = '22222222-2222-4222-8222-222222222222'
const other = '33333333-3333-4333-8333-333333333333'
const auth = '44444444-4444-4444-8444-444444444444'
const filename = 'src/app/api/admin/sequences/[id]/send-window/route.ts'
const body = { buyer_id: buyer, expected_start: '09:00', expected_end: '21:00', start: '08:00', end: '21:00' }
const config = { goal: 'call', brief: 'Proteção familiar', instructions: 'Perguntas curtas.', presentation: 'Agente',
  initial_delay_minutes: 60, repeat_minutes: 480, timezone: 'America/New_York', days: [1, 2, 3, 4, 5],
  start: '09:00', end: '21:00', stop_on_stage_exit: true, booking_url: '', future_field: { preserve: true } }
type Row = { id: string; buyer_id: string; mode: string; enabled: boolean; updated_at: string; ai_config: typeof config }
type Call = { url: URL; method: string; body: Record<string, unknown> | null }
function fixture() {
  const rows: Row[] = [sequence, other].map(id => ({ id, buyer_id: buyer, mode: 'ai_until_reply', enabled: true,
    updated_at: '2026-10-01T12:00:00+00:00', ai_config: structuredClone(config) }))
  const f = { rows, calls: [] as Call[], user: { id: auth } as { id: string } | null, isAdmin: true as unknown,
    authError: false, adminError: false, before: (...args: Call[]) => { void args }, reply: (_call: Call, response: Response) => response }
  const db = createClient('http://fixture.invalid', 'offline-fixture', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input))
      const call = { url, method: init?.method || 'GET', body: init?.body ? JSON.parse(String(init.body)) : null }
      f.calls.push(call); f.before(call)
      if (url.pathname.endsWith('/buyers')) {
        assert.equal(url.searchParams.get('auth_user_id'), 'eq.' + auth)
        return f.adminError ? Response.json({ message: 'private detail' }, { status: 503 }) : Response.json({ is_admin: f.isAdmin })
      }
      assert.ok(url.pathname.endsWith('/sequences'), 'no enrollment, dispatch, message or other table access')
      const matches = rows.filter(row => {
        for (const key of ['id', 'buyer_id', 'mode', 'enabled', 'updated_at', 'ai_config'] as const) {
          const filter = url.searchParams.get(key)
          if (filter && !isDeepStrictEqual(row[key], key === 'ai_config' ? JSON.parse(filter.slice(3)) : key === 'enabled' ? filter.slice(3) === 'true' : filter.slice(3))) return false
        }
        return true
      })
      if (call.method === 'PATCH') {
        assert.equal(url.searchParams.get('id'), 'eq.' + sequence)
        assert.equal(url.searchParams.get('buyer_id'), 'eq.' + buyer)
        assert.equal(url.searchParams.get('mode'), 'eq.ai_until_reply')
        for (const key of ['enabled', 'updated_at', 'ai_config']) assert.ok(url.searchParams.has(key), 'CAS requires ' + key)
        assert.deepEqual(Object.keys(call.body!).sort(), ['ai_config', 'updated_at'])
        for (const row of matches) Object.assign(row, structuredClone(call.body))
      } else assert.equal(call.method, 'GET')
      const single = new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object')
      return f.reply(call, Response.json(single ? matches[0] ?? null : matches, { headers: { 'content-range': `0-${Math.max(0, matches.length - 1)}/${matches.length}` } }))
    } },
  })
  return Object.assign(f, { async invoke(payload: unknown = body, id = sequence, raw = false) {
    assert.ok(existsSync(filename), 'admin send-window route must exist')
    const dependencies: Record<string, unknown> = {
      'next/server': { NextResponse }, 'node:util': { isDeepStrictEqual },
      '@/lib/ai-sequence-config': { validateAIConfig },
      '@/lib/supabase/admin': { createAdminClient: () => db },
      '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({
        data: { user: f.user }, error: f.authError ? { message: 'private detail' } : null,
      }) } }) },
    }
    const output: Record<string, (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>> = {}
    const js = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    new Function('require', 'exports', js)((name: string) => { assert.ok(name in dependencies, name); return dependencies[name] }, output)
    assert.deepEqual(Object.keys(output), ['POST'])
    return output.POST(new NextRequest(`http://fixture.invalid/api/admin/sequences/${id}/send-window`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ? String(payload) : JSON.stringify(payload),
    }), { params: Promise.resolve({ id }) })
  } })
}

test('verified admin updates only the window, preserves all other fields and never touches contacts', async () => {
  const f = fixture(); const before = structuredClone(f.rows)
  const response = await f.invoke(); assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.success, true); assert.equal(result.changed, true)
  assert.equal(result.enrollments_changed, false); assert.equal(result.messages_sent, false)
  assert.deepEqual(result.window, { start: '08:00', end: '21:00', repeat_minutes: 480, timezone: 'America/New_York', days: [1, 2, 3, 4, 5] })
  assert.deepEqual(f.rows[0].ai_config, { ...before[0].ai_config, start: '08:00' })
  assert.deepEqual(f.rows[1], before[1]); assert.equal(f.rows[0].enabled, true)
  assert.notEqual(f.rows[0].updated_at, before[0].updated_at)
  assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 1)
  assert.equal(f.calls.at(-1)!.method, 'GET'); assert.match(response.headers.get('cache-control')!, /no-store/)
  assert.ok(!JSON.stringify(result).includes('Perguntas curtas'), 'no instructions in response')
})

test('replay and already-correct window perform zero additional writes', async () => {
  const f = fixture(); f.rows[0].ai_config.start = '08:00'
  const response = await f.invoke(); assert.equal(response.status, 200); assert.equal((await response.json()).changed, false)
  assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 0)
})

test('missing session and auth error fail before database reads', async () => {
  for (const error of [false, true]) {
    const f = fixture(); if (error) f.authError = true; else f.user = null
    assert.equal((await f.invoke()).status, 401); assert.equal(f.calls.length, 0)
  }
})
for (const admin of [false, null, 'true', 1]) test(`non-admin rejected (${admin})`, async () => {
  const f = fixture(); f.isAdmin = admin
  assert.equal((await f.invoke()).status, 403); assert.equal(f.calls.length, 1)
})
test('admin lookup failure fails closed', async () => {
  const f = fixture(); f.adminError = true
  assert.equal((await f.invoke()).status, 503); assert.ok(f.calls.every(c => c.url.pathname.endsWith('/buyers')))
})
test('malformed body, extra fields, invalid IDs and invalid clocks never write', async () => {
  for (const payload of [null, [], {}, { ...body, repeat_minutes: 1 }, { ...body, buyer_id: other + ' ' },
    { ...body, start: '8:00' }, { ...body, start: 8 }, { ...body, end: '24:00' }, { ...body, start: '22:00' },
    { ...body, expected_start: 'bad' }, { ...body, expected_end: 21 }]) {
    const f = fixture(); assert.equal((await f.invoke(payload)).status, 400, JSON.stringify(payload)); assert.equal(f.calls.length, 1)
  }
  const f = fixture(); assert.equal((await f.invoke('{', sequence, true)).status, 400)
  const g = fixture(); assert.equal((await g.invoke(body, 'bad')).status, 400)
})
test('missing sequence or wrong owner returns 404 without write', async () => {
  const f = fixture(); assert.equal((await f.invoke(body, auth)).status, 404)
  const g = fixture(); assert.equal((await g.invoke({ ...body, buyer_id: other })).status, 404)
  assert.equal([...f.calls, ...g.calls].filter(c => c.method === 'PATCH').length, 0)
})
test('wrong mode, stale expected window and corrupt config fail without write', async () => {
  for (const mutate of [(r: Row) => { r.mode = 'legacy' }, (r: Row) => { r.ai_config.start = '10:00' }, (r: Row) => { r.ai_config.repeat_minutes = 0 }]) {
    const f = fixture(); mutate(f.rows[0]); assert.equal((await f.invoke()).status, 409)
    assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 0)
  }
})
test('disabled sequence remains disabled; changing window does not resume it', async () => {
  const f = fixture(); f.rows[0].enabled = false
  assert.equal((await f.invoke()).status, 200); assert.equal(f.rows[0].enabled, false)
})
test('CAS blocks concurrent config, ownership, mode, timestamp and enabled changes', async () => {
  for (const mutate of [(r: Row) => { r.ai_config.instructions = 'Concurrent edit' }, (r: Row) => { r.buyer_id = other },
    (r: Row) => { r.mode = 'legacy' }, (r: Row) => { r.updated_at = '2026-10-13T15:00:00Z' }, (r: Row) => { r.enabled = false }]) {
    const f = fixture(); f.before = c => { if (c.method === 'PATCH') mutate(f.rows[0]) }
    const response = await f.invoke(); assert.equal(response.status, 409)
    assert.equal(f.rows[0].ai_config.start, '09:00')
  }
})
for (const phase of ['read', 'update', 'readback']) test(`${phase} error never reports success or leaks private details`, async () => {
  const f = fixture(); let reads = 0
  f.reply = (c, response) => {
    if (!c.url.pathname.endsWith('/sequences')) return response
    if (c.method === 'GET') reads++
    if ((phase === 'read' && c.method === 'GET') || (phase === 'update' && c.method === 'PATCH') || (phase === 'readback' && reads >= 2)) return Response.json({ message: 'private detail' }, { status: 500 })
    return response
  }
  const response = await f.invoke(); assert.equal(response.status, 503)
  const result = await response.json(); assert.equal(result.reconcile_required, phase !== 'read')
  assert.ok(!JSON.stringify(result).includes('private'))
})
test('missing count or malformed update representation requires reconciliation; never retries write', async () => {
  for (const failure of ['count', 'data']) {
    const f = fixture(); f.reply = (c, response) => {
      if (c.method !== 'PATCH') return response
      if (failure === 'count') response.headers.delete('content-range'); else return Response.json([] , { headers: { 'content-range': '*/1' } })
      return response
    }
    const response = await f.invoke(); assert.equal(response.status, 503); assert.equal((await response.json()).reconcile_required, true)
    assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 1)
  }
})
test('concurrent edit after update detected by full config readback', async () => {
  const f = fixture(); let written = false
  f.before = c => { if (c.method === 'PATCH') written = true; else if (written) f.rows[0].ai_config.repeat_minutes = 1 }
  const response = await f.invoke(); assert.equal(response.status, 503); assert.equal((await response.json()).reconcile_required, true)
})
test('real scheduler respects 8 AM inclusive / 9 PM exclusive and preserves eight-hour cadence', () => {
  const changed = { ...config, start: '08:00' }
  assert.equal(nextSendAt(new Date('2026-10-14T11:59:00Z'), changed).toISOString(), '2026-10-14T12:00:00.000Z')
  assert.equal(nextSendAt(new Date('2026-10-14T12:00:00Z'), changed).toISOString(), '2026-10-14T12:00:00.000Z')
  assert.equal(nextSendAt(new Date('2026-10-15T01:00:00Z'), changed).toISOString(), '2026-10-15T12:00:00.000Z')
  assert.equal(nextSendAt(new Date(new Date('2026-10-13T17:16:55Z').getTime() + changed.repeat_minutes * 60000), changed).toISOString(), '2026-10-14T12:00:00.000Z')
})
