/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase I/O fixture and transpiled route boundary. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

// Synthetic identities only. The actual route and language/ownership rules run offline.
const LEAD = '11111111-1111-4111-8111-111111111111'
const OWNER = '22222222-2222-4222-8222-222222222222'
const TARGET = '33333333-3333-4333-8333-333333333333'
const STAMP = '2026-01-01T10:00:00.123456+00:00'
const body = { lead_id: LEAD, to_buyer_id: TARGET, refund_previous: false,
  expected_owner_id: OWNER, expected_updated_at: STAMP, reason: 'Recolhimento autorizado' }

type Call = { table: string; op: string; values?: any; filters: [string, string, any][]; selected?: string }
function fixture(options: { session?: boolean; admin?: boolean; targetAdmin?: boolean;
  fail?: string; throws?: string; empty?: string; race?: Record<string, unknown> } = {}) {
  const tables: Record<string, any[]> = {
    buyers: [{ id: 'actor', auth_user_id: 'session-user', is_admin: options.admin ?? true },
      { id: OWNER, is_admin: false }, { id: TARGET, is_admin: options.targetAdmin ?? true, name: 'Synthetic target', email: 'target@example.invalid' }],
    leads: [{ id: LEAD, assigned_to: OWNER, assigned_to_member: 'member', updated_at: STAMP,
      lead_language: 'pt', meta_lead_id: 'synthetic-meta', delivery_credit_id: 'old-credit' }],
    credits: [{ id: 'old-credit', buyer_id: OWNER, type: 'lead', lead_language: 'pt', total_purchased: 10, total_used: 4 },
      { id: 'new-credit', buyer_id: TARGET, type: 'lead', lead_language: 'pt', total_purchased: 10, total_used: 2 }],
    pipelines: [{ id: 'new-pipeline', buyer_id: TARGET, is_default: true,
      stages: [{ id: 'later-stage', position: 3 }, { id: 'first-stage', position: 0 }] }],
    pipeline_leads: [{ lead_id: LEAD, pipeline_id: 'old-pipeline', stage_id: 'old-stage' }],
    whatsapp_messages: [{ id: 'message', lead_id: LEAD, buyer_id: OWNER }],
    lead_delivery_receipts: [{ id: 'receipt', lead_id: LEAD, buyer_id: OWNER, credit_id: 'old-credit' }],
  }
  const calls: Call[] = []
  const notifications: any[] = []
  const db = { from(table: string) {
    assert.ok(table in tables, `Unexpected table: ${table}`)
    const call: Call = { table, op: 'select', filters: [] }
    let single = false, limit: number | undefined, order: string | undefined
    const q: any = {
      select(columns: string) { call.selected = columns; return q },
      update(values: any) { call.op = 'update'; call.values = values; return q },
      delete() { call.op = 'delete'; return q },
      upsert(values: any) { call.op = 'upsert'; call.values = values; return q },
      eq(key: string, value: any) { call.filters.push(['eq', key, value]); return q },
      neq(key: string, value: any) { call.filters.push(['neq', key, value]); return q },
      is(key: string, value: any) { call.filters.push(['eq', key, value]); return q },
      gt(key: string, value: any) { call.filters.push(['gt', key, value]); return q },
      order(key: string) { order = key; return q },
      limit(n: number) { limit = n; return q },
      single() { single = true; return q },
      maybeSingle() { single = true; return q },
      then(resolve: any, reject: any) {
        return Promise.resolve().then(() => {
          calls.push(structuredClone(call))
          const step = `${table}.${call.op}`
          if (options.throws === step) throw Error('Synthetic transport error')
          if (options.fail === step) return { data: null, error: { message: 'Synthetic DB error' } }
          if (table === 'leads' && call.op === 'update' && options.race) Object.assign(tables.leads[0], options.race)
          const matches = (row: any) => call.filters.every(([op, key, value]) =>
            op === 'gt' ? row[key] > value : op === 'neq' ? row[key] !== value : row[key] === value)
          let rows = options.empty === step ? [] : tables[table].filter(matches)
          if (order) rows.sort((a, b) => b[order!] - a[order!])
          if (limit) rows = rows.slice(0, limit)
          if (call.op === 'update') rows.forEach(row => Object.assign(row, call.values))
          if (call.op === 'delete') tables[table] = tables[table].filter(row => !rows.includes(row))
          if (call.op === 'upsert') { rows = [{ ...call.values }]; tables[table].push(...rows) }
          return { data: structuredClone(single ? rows[0] ?? null : rows), error: null }
        }).then(resolve, reject)
      },
    }
    return q
  } }
  function load(relative: string): any {
    const file = new URL(`../${relative}`, import.meta.url)
    const code = transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    }).outputText
    const mod = { exports: {} }
    const mocks: Record<string, any> = {
      'next/server': { NextResponse: Response },
      '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: options.session === false ? null : { id: 'session-user' } } }) } }) },
      '@/lib/supabase/admin': { createAdminClient: () => db },
      '@/lib/notifications': { sendLeadNotificationEmail: async (...args: any[]) => { notifications.push(args); return true } },
    }
    runInNewContext(code, { module: mod, exports: mod.exports, Response, Date, console,
      require(name: string) {
        if (name in mocks) return mocks[name]
        if (['@/lib/lead-language', '@/lib/lead-ownership'].includes(name)) return load(`src/${name.slice(2)}.ts`)
        throw Error(`Unmocked I/O/import: ${name}`)
      },
    }, { filename: file.pathname })
    return mod.exports
  }
  const { POST } = load('src/app/api/admin/reassign-lead/route.ts')
  return { tables, calls, notifications,
    writes: () => calls.filter(c => c.op !== 'select'),
    invoke: (payload: unknown = body) => POST({ json: async () => payload }) as Promise<Response> }
}

test('refund_previous:false does not refund the previous owner (baseline regression)', async () => {
  const f = fixture()
  const res = await f.invoke()
  assert.equal(res.status, 200)
  assert.equal(f.tables.credits[0].total_used, 4, 'previous owner must retain consumed credit')
  assert.equal(f.calls.filter(c => c.table === 'credits').length, 0)
  assert.equal((await res.json()).admin_isento, true)
})

test('default and explicit true preserve refund and paid target debit', async () => {
  for (const extra of [{}, { refund_previous: true }]) {
    const f = fixture({ targetAdmin: false })
    const res = await f.invoke({ lead_id: LEAD, to_buyer_id: TARGET, ...extra })
    assert.equal(res.status, 200)
    assert.equal(f.tables.credits[0].total_used, 3)
    assert.equal(f.tables.credits[1].total_used, 3)
    assert.equal(f.notifications.length, 1)
  }
})

test('rejects malformed bodies and opt-in parameters before mutations', async () => {
  const invalid = [null, [], 'body', {}, { ...body, lead_id: 'bad' }, { ...body, to_buyer_id: null },
    ...['refund_previous', 'notify_target'].flatMap(key => ['false', 'true', null, 0, 1].map(value => ({ ...body, [key]: value }))),
    ...[undefined, null, 'bad', '', 12].map(value => ({ ...body, expected_owner_id: value })),
    ...[undefined, null, 'bad', '2026-02-30T00:00:00Z', '2026-01-01', '2026-01-01T00:00:00', 12].map(value => ({ ...body, expected_updated_at: value })),
    ...[undefined, null, '', '  ', 12].map(value => ({ ...body, reason: value })),
  ]
  for (const payload of invalid) {
    const f = fixture()
    const res = await f.invoke(payload)
    assert.equal(res.status, 400, JSON.stringify(payload))
    assert.equal(f.writes().length, 0)
    assert.equal(f.notifications.length, 0)
  }
})

test('no-refund is restricted to an administrator target', async () => {
  const f = fixture({ targetAdmin: false })
  const res = await f.invoke()
  assert.equal(res.status, 400)
  assert.equal(f.writes().length, 0)
  assert.equal(f.notifications.length, 0)
})

test('session and administrator authorization remain enforced', async () => {
  for (const [options, status] of [[{ session: false }, 401], [{ admin: false }, 403]] as const) {
    const f = fixture(options)
    assert.equal((await f.invoke()).status, status)
    assert.equal(f.writes().length, 0)
  }
})

test('notify_target:false skips the notification helper entirely', async () => {
  const f = fixture()
  const res = await f.invoke({ ...body, notify_target: false })
  assert.equal(res.status, 200)
  assert.equal(f.notifications.length, 0)
  assert.equal(f.tables.leads[0].delivery_credit_id, null)
  assert.equal(f.tables.leads[0].assigned_to_member, null)
  assert.deepEqual(f.tables.lead_delivery_receipts, [{ id: 'receipt', lead_id: LEAD, buyer_id: OWNER, credit_id: 'old-credit' }])
  assert.equal(f.calls.some(c => /follow|sequence|automation|receipt/.test(c.table)), false)
})

test('owner and timestamp preconditions reject stale snapshots, including microseconds', async () => {
  for (const change of [{ expected_owner_id: LEAD }, { expected_updated_at: '2026-01-01T10:00:00.123455Z' }]) {
    const f = fixture()
    const res = await f.invoke({ ...body, ...change })
    assert.equal(res.status, 409)
    assert.equal(f.writes().length, 0)
  }
  const f = fixture()
  assert.equal((await f.invoke({ ...body, expected_updated_at: '2026-01-01T05:00:00.123456-05:00' })).status, 200)
})

test('same owner rejects without a second debit/refund', async () => {
  const f = fixture()
  f.tables.leads[0].assigned_to = TARGET
  assert.equal((await f.invoke()).status, 400)
  assert.equal(f.writes().length, 0)
})

test('CAS protects owner and updated_at between read and update in both modes', async () => {
  for (const refund_previous of [false, true]) {
    for (const race of [{ assigned_to: LEAD }, { updated_at: '2026-01-01T10:00:00.123457+00:00' }]) {
      const f = fixture({ race })
      const res = await f.invoke({ ...body, refund_previous })
      assert.equal(res.status, 409)
      assert.equal(f.writes().length, 1, 'only the unsuccessful CAS may be attempted')
      assert.equal(f.notifications.length, 0)
      assert.equal(f.tables.credits[0].total_used, 4)
      const cas = f.writes()[0]
      assert.ok(cas.selected, 'must observe the updated row')
      assert.deepEqual(cas.filters, [['eq', 'id', LEAD], ['eq', 'assigned_to', OWNER], ['eq', 'updated_at', STAMP]])
    }
  }
})

test('database errors never produce success and stop later writes', async () => {
  for (const step of ['leads.update', 'pipeline_leads.delete', 'pipeline_leads.upsert', 'whatsapp_messages.update']) {
    const f = fixture({ fail: step })
    const res = await f.invoke({ ...body, notify_target: false })
    assert.equal(res.status, 503, step)
    const result = await res.json()
    assert.equal(result.success, false, step)
    assert.equal(result.failed_step, step, step)
    assert.equal(result.partial, step !== 'leads.update', step)
    assert.equal(f.notifications.length, 0)
    assert.equal(f.tables.credits[0].total_used, 4)
    assert.equal(f.writes().at(-1)?.table + '.' + f.writes().at(-1)?.op, step)
  }
})

test('transport rejection returns explicit uncertain operation instead of success', async () => {
  for (const step of ['leads.update', 'pipeline_leads.delete', 'pipeline_leads.upsert', 'whatsapp_messages.update']) {
    const f = fixture({ throws: step })
    const res = await f.invoke(body)
    assert.equal(res.status, 503, step)
    const result = await res.json()
    assert.equal(result.success, false)
    assert.equal(result.failed_step, step)
    assert.equal(result.reconcile_required, true)
    assert.equal(f.notifications.length, 0)
  }
})

test('default pipeline and first stage are required before any mutation', async () => {
  for (const stages of [null, []]) {
    const f = fixture()
    if (stages === null) f.tables.pipelines = []
    else f.tables.pipelines[0].stages = stages
    assert.equal((await f.invoke()).status, 409)
    assert.equal(f.writes().length, 0)
    assert.equal(f.notifications.length, 0)
  }
  const f = fixture()
  assert.equal((await f.invoke()).status, 200)
  assert.equal(f.tables.pipeline_leads[0].stage_id, 'first-stage')
  assert.ok(f.calls.findIndex(c => c.table === 'pipelines') < f.calls.findIndex(c => c.op !== 'select'))
})
