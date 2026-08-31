const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const ts = require('typescript')
function load(file, mocks = {}, env = {}) {
  const module = { exports: {} }
  const filename = path.join(__dirname, '..', file)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      require: (n) => (n in mocks ? mocks[n] : n === '@/lib/lead-language' ? load('src/lib/lead-language.ts') : require(n)),
      URL,
      Request,
      Response,
      AbortSignal,
      fetch,
      Date,
      Map,
      Set,
      console: { log() {}, error() {} },
      process: { env },
    },
    { filename },
  )
  return module.exports
}
const helpers = load('src/lib/meta-poll.ts')
const lead = (id, day = 2) => ({
  id: String(id),
  created_time: `2026-09-${String(day).padStart(2, '0')}T09:00:00Z`,
  form_id: 'br',
  field_data: [
    { name: 'full_name', values: ['Test ' + id] },
    { name: 'phone_number', values: ['14075550100'] },
  ],
})
const response = (data) => new Response(JSON.stringify(data), { status: 200 })

test('reads every page, deduplicates, then globally orders both forms oldest first', async () => {
  const requests = []
  const result = await helpers.fetchMetaFormLeads(['br', 'es'], 'SECRET', new Date('2026-09-01'), async (url) => {
    const u = new URL(url)
    requests.push(u)
    if (u.pathname.includes('/es/')) return response({ data: [lead('es', 1)] })
    if (!u.searchParams.has('after'))
      return response({
        data: [lead('new', 4), lead('middle', 3)],
        paging: { next: 'must-not-be-followed', cursors: { after: 'page2' } },
      })
    return response({ data: [lead('middle', 3), lead('old', 2)] })
  })
  assert.equal(result.map((l) => l.id).join(','), 'es,old,middle,new')
  assert.equal(requests.length, 3)
  assert.equal(requests[1].searchParams.get('after'), 'page2')
  assert.equal(JSON.parse(requests[0].searchParams.get('filtering'))[0].field, 'time_created')
})
test('Meta errors and malformed pagination fail instead of reporting a successful empty poll', async () => {
  await assert.rejects(
    helpers.fetchMetaFormLeads(['br'], 'SECRET', new Date(), async () =>
      response({ error: { code: 190, message: 'private' } }),
    ),
    /190/,
  )
  await assert.rejects(
    helpers.fetchMetaFormLeads(['br'], 'SECRET', new Date(), async () =>
      response({ data: [lead(1)], paging: { next: 'url' } }),
    ),
    /cursor/,
  )
  await assert.rejects(
    helpers.fetchMetaFormLeads(['br'], 'SECRET', new Date(), async () =>
      response({ data: [lead(1)], paging: { next: 'url', cursors: { after: 'same' } } }),
    ),
    /cursor/,
  )
})

function fakeDb() {
  const tables = {
    settings: [{ key: 'lead_routing', value: { mode: 'normal', admin_rule: { one_in: 2, daily_max: null } } }],
    leads: [],
    buyers: [],
  }
  let nextId = 1
  return {
    tables,
    from(table) {
      const rows = (tables[table] ||= [])
      let mode = 'select',
        payload,
        filters = [],
        single = false,
        take = Infinity
      const q = {
        select() {
          return q
        },
        eq(k, v) {
          filters.push((r) => (k === 'value->>owner' ? r.value.owner === v : r[k] === v))
          return q
        },
        is(k, v) {
          filters.push((r) => (r[k] ?? null) === v)
          return q
        },
        not(k, op, v) {
          filters.push((r) => (r[k] ?? null) !== v)
          return q
        },
        gte(k, v) {
          filters.push((r) => r[k] >= v)
          return q
        },
        in(k, v) {
          filters.push((r) => v.includes(r[k]))
          return q
        },
        limit(n) {
          take = n
          return q
        },
        single() {
          single = true
          return q
        },
        maybeSingle() {
          single = true
          return q
        },
        insert(v) {
          mode = 'insert'
          payload = v
          return q
        },
        upsert(v) {
          mode = 'upsert'
          payload = v
          return q
        },
        delete() {
          mode = 'delete'
          return q
        },
        then(resolve, reject) {
          try {
            let data = rows.filter((r) => filters.every((f) => f(r))).slice(0, take)
            if (mode === 'insert' || mode === 'upsert') {
              const key = table === 'settings' ? 'key' : 'meta_lead_id'
              const found = rows.find((r) => r[key] === payload[key])
              if (found && mode === 'insert')
                return Promise.resolve({ data: null, error: { code: '23505' } }).then(resolve, reject)
              const row = found ? Object.assign(found, payload) : { id: 'db-' + nextId++, ...payload }
              if (!found) rows.push(row)
              data = [row]
            }
            if (mode === 'delete') {
              for (const row of data) rows.splice(rows.indexOf(row), 1)
            }
            return Promise.resolve({ data: single ? data[0] || null : data, error: null }).then(resolve, reject)
          } catch (e) {
            return Promise.reject(e).then(resolve, reject)
          }
        },
      }
      return q
    },
  }
}
test('distributed lease permits one owner; expiry is recoverable and old owner cannot release new lease', async () => {
  const db = fakeDb()
  const now = Date.now()
  const got = await Promise.all([
    helpers.acquireMetaPollLease(db, 'a', now),
    helpers.acquireMetaPollLease(db, 'b', now),
  ])
  assert.equal(got.filter(Boolean).length, 1)
  assert.equal(await helpers.acquireMetaPollLease(db, 'c', now + 601000), true)
  await helpers.releaseMetaPollLease(db, 'a')
  assert.equal(db.tables.settings.find((r) => r.key === 'meta_poll_lease').value.owner, 'c')
  await helpers.releaseMetaPollLease(db, 'c')
  assert.equal(
    db.tables.settings.some((r) => r.key === 'meta_poll_lease'),
    false,
  )
})

function routeFixture(candidates, options = {}) {
  const db = fakeDb(),
    deliveries = []
  const noop = async () => 0
  const mods = {
    'next/server': { NextResponse: { json: (data, init) => new Response(JSON.stringify(data), init) } },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/meta-poll': {
      ...helpers,
      fetchMetaFormLeads: async () => {
        if (options.fetchError) throw Error('Meta unavailable')
        return candidates
      },
    },
    '@/lib/distribute': {
      tryAdminRule: async (l) => {
        if (options.priorityError) throw Error('priority unavailable')
        return null
      },
      distributeLeadToNextBuyer: async (l) => {
        deliveries.push(l.meta_lead_id)
        l.assigned_to = 'buyer'
        return { name: 'Buyer' }
      },
      redistributePendingLeads: noop,
    },
    '@/lib/sms-auto': { dispatchScheduledSms: noop },
    '@/lib/referral': { releasePendingRewards: noop },
    '@/lib/crm-bonus-drip': { dripLegacyCrmBonusLeads: noop },
    '@/lib/notifications': {
      notifyGroupLeadPending: noop,
      sendLeadNotificationEmail: noop,
      checkBridgeHealthAndAlert: async () => true,
      checkAllBridgesAndAlert: async () => ({ checked: 1, down: 0, alerts: 0 }),
    },
    '@/lib/us-area-codes': { stateFromPhone: () => 'FL' },
  }
  return {
    ...load('src/app/api/poll-leads/route.ts', mods, {
      POLL_SECRET: 'poll',
      CRON_SECRET: 'cron',
      META_PAGE_TOKEN: 'meta',
    }),
    db,
    deliveries,
  }
}
const req = (key = 'cron') =>
  new Request('https://example.com/api/poll-leads', {
    headers: { authorization: 'Bearer ' + key, 'x-vercel-cron-schedule': '*/2 * * * *' },
  })
test('authentication rejects unauthenticated callers and accepts native Vercel header', async () => {
  const f = routeFixture([])
  assert.equal((await f.GET(req('wrong'))).status, 401)
  assert.equal(f.db.tables.settings.length, 1)
  const r = await f.GET(req())
  assert.equal(r.status, 200)
  assert.equal((await r.json()).trigger, 'vercel-cron')
})
test('36-lead outage drains in ordered batches, repeated poll never reassigns or double charges', async () => {
  const candidates = Array.from({ length: 36 }, (_, i) => lead(i))
  const f = routeFixture(candidates)
  for (const [imported, remaining] of [
    [10, 26],
    [10, 16],
    [10, 6],
    [6, 0],
    [0, 0],
  ]) {
    const r = await f.GET(req())
    const body = await r.json()
    assert.equal(r.status, 200)
    assert.equal(body.imported, imported)
    assert.equal(body.remaining, remaining)
  }
  assert.equal(f.deliveries.join(','), candidates.map((l) => l.id).join(','))
  assert.equal(f.db.tables.leads.length, 36)
  assert.ok(f.db.tables.settings.find((r) => r.key === 'meta_poll_health').value.last_success_at)
  assert.equal(
    f.db.tables.settings.some((r) => r.key === 'meta_poll_lease'),
    false,
  )
})
test('invalid phone is not delivered, charged or checkpointed as successful', async () => {
  const f = routeFixture([{ ...lead(1), field_data: [] }])
  const res = await f.GET(req())
  assert.equal(res.status, 503)
  assert.equal(f.deliveries.length, 0)
  assert.equal(f.db.tables.leads.length, 0)
  assert.equal(f.db.tables.settings.find((r) => r.key === 'meta_poll_health').value.last_success_at, null)
})
test('failed Meta read or priority decision is not silently bypassed', async () => {
  for (const option of [{ fetchError: true }, { priorityError: true }]) {
    const f = routeFixture([lead(1)], option)
    const res = await f.GET(req())
    assert.equal(res.status, 503)
    assert.equal(f.deliveries.length, 0)
    assert.equal(
      f.db.tables.settings.some((r) => r.key === 'meta_poll_lease'),
      false,
    )
  }
})
test('cron schedule is versioned and reconciliation uses assignment time for recovered old leads', () => {
  const conf = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json')))
  assert.deepEqual(conf.crons, [{ path: '/api/poll-leads', schedule: '*/2 * * * *' }])
  const src = fs.readFileSync(path.join(__dirname, '../src/app/api/poll-leads/route.ts'), 'utf8')
  assert.match(src, /\.gte\('assigned_at', cutoff\)/)
  assert.doesNotMatch(src, /limit=20/)
})
