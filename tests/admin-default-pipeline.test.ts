import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import ts from 'typescript'

const buyer = '11111111-1111-4111-8111-111111111111'
const target = '22222222-2222-4222-8222-222222222222'
const other = '33333333-3333-4333-8333-333333333333'
const foreign = '44444444-4444-4444-8444-444444444444'
const auth = '55555555-5555-4555-8555-555555555555'
const filename = 'src/app/api/admin/buyers/[id]/default-pipeline/route.ts'

type Row = { id: string; buyer_id: string; is_default: boolean | null }
type Call = { url: URL; method: string; body: unknown }
function fixture() {
  const rows: Row[] = [
    { id: target, buyer_id: buyer, is_default: false },
    { id: other, buyer_id: buyer, is_default: false },
    { id: foreign, buyer_id: foreign, is_default: true },
  ]
  const stages = new Set([target, other, foreign])
  const calls: Call[] = []
  const f = {
    rows, stages, calls, user: { id: auth } as { id: string } | null,
    isAdmin: true as unknown, authError: false, adminError: false,
    before: (() => {}) as (call: Call, number: number) => void,
    reply: (_call: Call, response: Response) => response,
    authChecks: 0,
  }
  const db = createClient('http://fixture.invalid', 'offline-fixture', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input))
      const call = { url, method: init?.method || 'GET', body: init?.body ? JSON.parse(String(init.body)) : null }
      calls.push(call)
      f.before(call, calls.length)
      const table = url.pathname.split('/').at(-1)
      if (table === 'buyers') {
        assert.equal(url.searchParams.get('auth_user_id'), 'eq.' + auth)
        return f.adminError ? Response.json({ message: 'private db detail' }, { status: 503 }) : Response.json({ is_admin: f.isAdmin })
      }
      assert.equal(table, 'pipelines', 'no leads/cards/sequences or unrelated tables')
      let matches = rows.filter(row => {
        for (const key of ['id', 'buyer_id', 'is_default'] as const) {
          const filter = url.searchParams.get(key)
          if (!filter) continue
          const expected = filter.slice(filter.indexOf('.') + 1)
          if (String(row[key]) !== expected) return false
        }
        const or = url.searchParams.get('or')
        return !or || row.id === target || row.is_default === true
      })
      if (call.method === 'PATCH') {
        assert.deepEqual(call.body, { is_default: true })
        assert.equal(url.searchParams.get('id'), 'eq.' + target)
        assert.equal(url.searchParams.get('buyer_id'), 'eq.' + buyer)
        assert.ok(url.searchParams.has('is_default'), 'conditional update of observed state')
        for (const row of matches) row.is_default = true
      } else assert.equal(call.method, 'GET')
      const total = matches.length
      const limit = url.searchParams.get('limit')
      if (limit) matches = matches.slice(0, Number(limit))
      const projected = matches.map(row => ({ ...row, ...(url.searchParams.get('select')?.includes('pipeline_stages') ? { stages: stages.has(row.id) ? [{ id: '66666666-6666-4666-8666-666666666666' }] : [] } : {}) }))
      const single = new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object')
      const data = single ? projected[0] ?? null : projected
      return f.reply(call, Response.json(data, { headers: { 'content-range': `0-${Math.max(0, projected.length - 1)}/${total}` } }))
    } },
  })
  function load() {
    assert.ok(existsSync(filename), 'admin default-pipeline POST route must exist')
    const dependencies: Record<string, unknown> = {
      'next/server': { NextResponse },
      '@/lib/supabase/admin': { createAdminClient: () => db },
      '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => {
        f.authChecks++
        return { data: { user: f.user }, error: f.authError ? { message: 'private auth detail' } : null }
      } } }) },
    }
    const output: Record<string, (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>> = {}
    const js = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    new Function('require', 'exports', js)((name: string) => {
      assert.ok(name in dependencies, `unexpected dependency: ${name}`)
      return dependencies[name]
    }, output)
    assert.deepEqual(Object.keys(output), ['POST'])
    return output.POST
  }
  return Object.assign(f, { async invoke(body: unknown = { pipeline_id: target }, id = buyer, raw = false) {
    const post = load()
    const request = new NextRequest(`http://fixture.invalid/api/admin/buyers/${id}/default-pipeline`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ? String(body) : JSON.stringify(body),
    })
    return post(request, { params: Promise.resolve({ id }) })
  } })
}

test('real POST route rejects missing verified session before any database access', async () => {
  const f = fixture(); f.user = null
  assert.equal((await f.invoke()).status, 401)
  assert.equal(f.authChecks, 1)
  assert.equal(f.calls.length, 0)
})

for (const admin of [false, null, 'true', 1]) {
  test(`verified session without boolean is_admin=true is forbidden (${admin})`, async () => {
    const f = fixture(); f.isAdmin = admin
    assert.equal((await f.invoke()).status, 403)
    assert.equal(f.calls.length, 1)
  })
}

test('auth errors and admin lookup errors fail closed without scope reads', async () => {
  const f = fixture(); f.authError = true
  assert.equal((await f.invoke()).status, 401); assert.equal(f.calls.length, 0)
  const g = fixture(); g.adminError = true
  assert.equal((await g.invoke()).status, 503)
  assert.ok(g.calls.every(call => call.url.pathname.endsWith('/buyers')), 'SDK may retry failed reads, never scope reads')
})

test('invalid UUIDs and strict JSON body are rejected without pipeline queries', async () => {
  for (const body of [null, [], {}, { pipeline_id: 1 }, { pipeline_id: 'bad' }, { pipeline_id: target + ' ' }, { pipeline_id: target, buyer_id: foreign }, { pipeline_id: target, populate_existing: true }]) {
    const f = fixture(); assert.equal((await f.invoke(body)).status, 400, JSON.stringify(body))
    assert.equal(f.calls.length, 1)
  }
  for (const id of ['bad', buyer + ' ', 'pseudo-' + buyer]) {
    const f = fixture(); assert.equal((await f.invoke(undefined, id)).status, 400)
    assert.equal(f.calls.length, 1)
  }
  const f = fixture(); assert.equal((await f.invoke('{', buyer, true)).status, 400)
  assert.equal(f.calls.length, 1)
})

test('unknown buyer/pipeline and mismatched owner never write', async () => {
  for (const [id, pipelineId] of [[foreign, target], [buyer, foreign], [buyer, auth], [auth, target]]) {
    const f = fixture(); assert.equal((await f.invoke({ pipeline_id: pipelineId }, id)).status, 404)
    assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 0)
  }
})

test('target needs stages even for idempotent call', async () => {
  for (const isDefault of [false, true]) {
    const f = fixture(); f.rows[0].is_default = isDefault; f.stages.delete(target)
    assert.equal((await f.invoke()).status, 409)
    assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 0)
  }
})

test('existing different or multiple defaults are conflicts, never cleared', async () => {
  for (const isDefault of [false, true]) {
    const f = fixture(); f.rows[0].is_default = isDefault; f.rows[1].is_default = true
    const before = structuredClone(f.rows)
    const response = await f.invoke()
    assert.equal(response.status, 409)
    assert.deepEqual(f.rows, before)
    assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 0)
  }
})

test('absent default: exactly one scoped conditional update then exact readback; replay does not write', async () => {
  for (const value of [false, null]) {
    const f = fixture(); f.rows[0].is_default = value
    const before = structuredClone(f.rows)
    const response = await f.invoke()
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      success: true, changed: true, future_leads_only: true,
      pipeline: { id: target, buyer_id: buyer, is_default: true }, default_count: 1,
    })
    assert.match(response.headers.get('cache-control')!, /no-store/)
    assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 1)
    assert.equal(f.calls.at(-1)!.method, 'GET')
    assert.deepEqual(f.rows.slice(1), before.slice(1))
    const replay = await f.invoke()
    assert.equal(replay.status, 200)
    assert.equal((await replay.json()).changed, false)
    assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 1)
  }
})

test('already unique default is idempotent with zero updates', async () => {
  const f = fixture(); f.rows[0].is_default = true
  const response = await f.invoke()
  assert.equal(response.status, 200); assert.equal((await response.json()).changed, false)
  assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 0)
})

for (const phase of ['target', 'defaults', 'update', 'readback']) {
  for (const failure of ['http', 'throw', 'missing-data', 'missing-count']) {
    test(`${phase} ${failure} fails closed; no private errors in response`, async () => {
      const f = fixture()
      function applies(call: Call) {
        if (!call.url.pathname.endsWith('/pipelines')) return false
        if (call.method === 'PATCH') return phase === 'update'
        return phase === (call.url.searchParams.has('or') ? 'readback' : call.url.searchParams.has('id') ? 'target' : 'defaults')
      }
      f.reply = (call, response) => {
        if (!applies(call)) return response
        if (failure === 'http') return Response.json({ message: 'private db detail' }, { status: 500 })
        if (failure === 'throw') throw Error('private db detail')
        if (failure === 'missing-data') return Response.json(null)
        response.headers.delete('content-range')
        return response
      }
      const response = await f.invoke()
      // Target uses maybeSingle, so no count is needed; null is a genuine 404.
      if (phase === 'target' && failure === 'missing-count') { assert.equal(response.status, 200); return }
      if (phase === 'target' && failure === 'missing-data') { assert.equal(response.status, 404); return }
      assert.equal(response.status, 503)
      const body = await response.json()
      assert.equal(body.reconcile_required, phase === 'update' || phase === 'readback')
      assert.ok(!JSON.stringify(body).includes('private'))
      if (phase === 'target' || phase === 'defaults') assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 0)
    })
  }
}

test('ambiguous UPDATE representation requires reconciliation even if readback would be valid', async () => {
  for (const data of [[], [{ id: foreign, buyer_id: buyer, is_default: true }], [{ id: target, buyer_id: foreign, is_default: true }], [{ id: target, buyer_id: buyer, is_default: false }]]) {
    const f = fixture()
    f.reply = (call, response) => call.method === 'PATCH' ? Response.json(data, { headers: { 'content-range': '0-0/1' } }) : response
    const response = await f.invoke()
    assert.equal(response.status, 503); assert.equal((await response.json()).reconcile_required, true)
  }
})

for (const race of ['other-default', 'owner-change', 'delete-target', 'default-cleared', 'stages-deleted', 'same-target-before-write']) {
  test(`detectable race: ${race} fails closed without rollback or clearing anything`, async () => {
    const f = fixture(); let written = false
    f.before = call => {
      if (call.method === 'PATCH') {
        if (race === 'same-target-before-write') f.rows[0].is_default = true
        written = true; return
      }
      if (!written) return
      if (race === 'other-default') f.rows[1].is_default = true
      if (race === 'owner-change') f.rows[0].buyer_id = foreign
      if (race === 'delete-target') f.rows.splice(0, 1)
      if (race === 'default-cleared') f.rows[0].is_default = false
      if (race === 'stages-deleted') f.stages.delete(target)
    }
    const response = await f.invoke()
    assert.equal(response.status, 503)
    assert.equal((await response.json()).reconcile_required, true)
    assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 1)
    if (race === 'other-default') assert.equal(f.rows[1].is_default, true)
  })
}

test('exact default count catches truncated results instead of accepting an arbitrary first row', async () => {
  const f = fixture(); f.rows[1].is_default = true
  f.reply = (call, response) => call.url.searchParams.get('is_default') === 'eq.true'
    ? Response.json([], { headers: { 'content-range': '*/1' } }) : response
  const response = await f.invoke()
  assert.equal(response.status, 503)
  assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 0)
})
