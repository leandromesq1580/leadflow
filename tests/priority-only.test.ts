/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic Supabase query-chain I/O fixture and transpiled module boundary. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { transpileModule, ModuleKind, ScriptTarget, JsxEmit } from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Only external I/O is replaced. Routing, policy, credit arithmetic and availability are real.
const nativeRequire = createRequire(import.meta.url)
export function loadApp(db: any, extras: Record<string, any> = {}) {
  const cache = new Map<string, any>()
  const io: Record<string, any> = {
    './supabase/admin': { createAdminClient: () => db },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    './notifications': { sendLeadNotificationEmail: async () => {}, sendTeamMemberNotification: async () => {} },
    './automation-engine': { runAutomations: async () => ({ ran: 0, failed: 0 }) },
    './place-member-lead': {}, './wa-bridge': {}, ...extras,
  }
  function load(file: string): any {
    if (cache.has(file)) return cache.get(file)
    const compiled = { exports: {} as any }; cache.set(file, compiled.exports)
    const js = transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    new Function('require', 'module', 'exports', js)((name: string) => {
      if (name in io) return io[name]
      if (name.startsWith('.')) return load(resolve(dirname(file), name + '.ts'))
      if (name.startsWith('@/')) return load(resolve('src', name.slice(2) + '.ts'))
      return nativeRequire(name)
    }, compiled, compiled.exports)
    return compiled.exports
  }
  return (file = 'src/lib/distribute.ts') => load(resolve(file))
}

export const priority = { id: 'priority', name: 'Priority', email: 'priority@example.invalid', is_active: true, remaining: 3, leads_count: 0 }
export const outsider = { ...priority, id: 'outside', email: 'outside@example.invalid' }
export const lead = { id: 'lead', meta_lead_id: 'meta', name: 'Fixture', email: '', phone: '', city: '', state: 'FL', interest: '', campaign_name: '', product_type: 'lead', lead_language: 'pt' }
export function fixture(options: any = {}) {
  const settings = { priority_only: true, fallback_email: outsider.email, admin_rule: { admin_emails: [], one_in: 3 }, ...options.settings }
  const calls: any[] = []
  const buyers = options.buyers || [priority, outsider]
  const db: any = {
    calls, settings,
    async rpc(name: string, args: any) {
      calls.push({ rpc: name, args })
      if (name === 'get_eligible_buyers_by_language') return { data: buyers, error: null }
      if (name === 'assign_paid_lead_with_credit') return { data: 'credit-' + args.p_language, error: null }
      throw new Error(name)
    },
    from(table: string) {
      const q: any = { table, ops: [] }; calls.push(q)
      const chain: any = new Proxy({}, { get: (_, key) => key === 'then'
        ? (ok: any, fail: any) => Promise.resolve().then(() => {
          const eq = (col: string) => q.ops.find((o: any[]) => o[0] === 'eq' && o[1] === col)?.[2]
          if (table === 'settings') {
            if (eq('key') === 'lead_routing') {
              if (options.settingsError) return { data: null, error: new Error('settings unavailable') }
              const update = q.ops.find((o: any[]) => o[0] === 'update')
              if (update) {
                assert.equal(eq('value'), JSON.stringify(settings), 'counter writes must compare the persisted snapshot')
                Object.assign(settings, structuredClone(update[1].value))
                return { data: { key: 'lead_routing' }, error: null }
              }
              options.onRoutingRead?.(settings)
              // Supabase returns independent JSON snapshots, not shared fixture state.
              return { data: { value: structuredClone(settings) }, error: null }
            }
            return { data: [] }
          }
          let rows: any[] = []
          if (table === 'buyers' && eq('auth_user_id')) return { data: { is_admin: true } }
          if (table === 'buyers') rows = buyers
          if (table === 'buyer_states') rows = options.states || buyers.map((b: any) => ({ buyer_id: b.id, state_code: 'FL' }))
          if (table === 'credits') rows = options.credits || buyers.map((b: any) => ({ buyer_id: b.id, total_purchased: 3, total_used: 0, expires_at: null, type: 'lead', lead_language: lead.lead_language }))
          if (table === 'buyer_availability') rows = options.availability || []
          if (table === 'leads') {
            const inserted = q.ops.find((o: any[]) => o[0] === 'insert')?.[1]
            if (inserted) return { data: { id: 'inserted', ...inserted } }
            if (q.ops.some((o: any[]) => o[0] === 'select' && o[2]?.count)) return { count: options.receivedToday || 0, error: null }
            rows = options.pending || []
          }
          for (const [op, col, val] of q.ops) {
            if (op === 'eq') rows = rows.filter(r => r[col] === val)
            if (op === 'in') rows = rows.filter(r => val.includes(r[col]))
          }
          return { data: q.ops.some((o: any[]) => ['single', 'maybeSingle'].includes(o[0])) ? rows[0] || null : rows, error: null }
        }).then(ok, fail)
        : (...args: any[]) => { q.ops.push([key, ...args]); return chain } })
      return chain
    },
  }
  return db
}

test('webhook and poll HTTP handlers enforce the real guard for PT/ES; pending reprocessing also cannot escape', async (t) => {
  const originalToken = process.env.META_PAGE_TOKEN
  const originalSecret = process.env.POLL_SECRET
  const originalForce = process.env.FORCE_ASSIGN_TO_EMAILS
  process.env.META_PAGE_TOKEN = 'synthetic-test-token'
  process.env.POLL_SECRET = 'synthetic-test-secret'
  process.env.FORCE_ASSIGN_TO_EMAILS = outsider.email
  t.after(() => {
    for (const [key, value] of Object.entries({ META_PAGE_TOKEN: originalToken, POLL_SECRET: originalSecret, FORCE_ASSIGN_TO_EMAILS: originalForce })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  })
  const field_data = [{ name: 'full_name', values: ['Fixture'] }, { name: 'phone_number', values: ['14075550100'] }]
  t.mock.method(globalThis, 'fetch', async () => Response.json({ field_data }))
  for (const [language, form_id] of [['pt', '25952858404333766'], ['es', '1963007337624994']]) {
    const db = fixture({ settings: { mode: 'exclusive', exclusive_email: outsider.email } })
    const app = loadApp(db, {
      '@/lib/meta-poll': { acquireMetaPollLease: async () => true, releaseMetaPollLease: async () => {},
        fetchMetaFormLeads: async () => [{ id: 'meta-new', form_id, field_data, created_time: new Date().toISOString() }] },
      '@/lib/sms-auto': { dispatchScheduledSms: async () => {} },
      '@/lib/referral': { releasePendingRewards: async () => {} },
      '@/lib/crm-bonus-drip': { dripLegacyCrmBonusLeads: async () => 0 },
      '@/lib/notifications': { notifyGroupLeadPending: async () => {}, sendLeadNotificationEmail: async () => {},
        checkBridgeHealthAndAlert: async () => false, checkAllBridgesAndAlert: async () => ({}) },
    })
    const webhook = await app('src/app/api/webhook/meta/route.ts').POST(new Request('http://localhost/api/webhook/meta', {
      method: 'POST', body: JSON.stringify({ entry: [{ changes: [{ value: { leadgen_id: 'meta-new', form_id } }] }] }),
    }))
    assert.equal((await webhook.json()).lead_id, 'inserted')
    const poll = await app('src/app/api/poll-leads/route.ts').GET(new Request('http://localhost/api/poll-leads?secret=synthetic-test-secret'))
    assert.equal(poll.status, 200)
    assert.equal((await poll.json()).imported, 1)
    assert.equal(db.calls.some((c: any) => c.rpc === 'assign_paid_lead_with_credit'), false)
    const pendingDb = fixture({ pending: [{ ...lead, lead_language: language, status: 'new', assigned_to: null }] })
    assert.equal(await loadApp(pendingDb)().redistributePendingLeads([outsider.email]), 0)
    assert.equal(pendingDb.calls.some((c: any) => c.rpc === 'assign_paid_lead_with_credit'), false)
  }
})

test('poll sequential accounting follows the delivery policy, not a stale OFF target', async (t) => {
  const previous = { META_PAGE_TOKEN: process.env.META_PAGE_TOKEN, POLL_SECRET: process.env.POLL_SECRET }
  process.env.META_PAGE_TOKEN = 'synthetic-test-token'
  process.env.POLL_SECRET = 'synthetic-test-secret'
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  })
  for (const [language, form_id] of [['pt', '25952858404333766'], ['es', '1963007337624994']]) {
    for (const sameBuyer of [false, true]) {
      for (const transition of ['OFF→ON', 'OFF', 'OFF→ON→OFF']) {
        const enableDuringForce = transition !== 'OFF'
        const disableAfterPriority = transition === 'OFF→ON→OFF'
        await t.test(`${language} A${sameBuyer ? '=' : '!='}B ${transition}`, async () => {
          const target = sameBuyer ? priority : outsider
          let routingReads = 0
          const db = fixture({
            settings: { priority_only: false, mode: 'sequential',
              admin_rule: { admin_emails: [priority.email], one_in: 0 },
              steps: [{ email: target.email, limit: 2, delivered: 0 }, { email: outsider.email, limit: 10, delivered: 0 }],
            },
            credits: [priority, outsider].map(b => ({ buyer_id: b.id, total_purchased: 3, total_used: 0, type: 'lead', lead_language: language })),
            onRoutingRead(settings: any) {
              routingReads++
              // Poll snapshot + tryAdminRule see OFF; forceAssignRoundRobin sees ON.
              if (enableDuringForce && routingReads === 3) settings.priority_only = true
            },
          })
          const delivered: string[] = []
          const rpc = db.rpc.bind(db)
          db.rpc = async (name: string, args: any) => {
            if (name === 'assign_paid_lead_with_credit') {
              delivered.push(args.p_buyer_id)
              // Reverting the switch before poll accounts must not erase the
              // policy of this delivery; subsequent leads resume the old schedule.
              if (disableAfterPriority && delivered.length === 1) db.settings.priority_only = false
            }
            return rpc(name, args)
          }
          const snapshots = structuredClone(db.settings.steps)
          const app = loadApp(db, {
            '@/lib/meta-poll': { acquireMetaPollLease: async () => true, releaseMetaPollLease: async () => {},
              fetchMetaFormLeads: async () => [0, 1, 2].map(i => ({ id: `meta-sequential-${i}`, form_id,
                field_data: [{ name: 'phone_number', values: ['14075550100'] }], created_time: new Date().toISOString() })) },
            '@/lib/sms-auto': { dispatchScheduledSms: async () => {} },
            '@/lib/referral': { releasePendingRewards: async () => {} },
            '@/lib/crm-bonus-drip': { dripLegacyCrmBonusLeads: async () => 0 },
            '@/lib/notifications': { notifyGroupLeadPending: async () => {}, sendLeadNotificationEmail: async () => {},
              checkBridgeHealthAndAlert: async () => false, checkAllBridgesAndAlert: async () => ({}) },
          })
          const response = await app('src/app/api/poll-leads/route.ts').GET(new Request('http://localhost/api/poll-leads?secret=synthetic-test-secret'))
          assert.equal(response.status, 200)
          assert.equal((await response.json()).imported, 3)
          assert.deepEqual(delivered, disableAfterPriority ? [priority.id, target.id, target.id]
            : enableDuringForce ? [priority.id, priority.id, priority.id] : [target.id, target.id, outsider.id])
          assert.equal(db.settings.priority_only, enableDuringForce && !disableAfterPriority)
          assert.deepEqual(db.settings.steps, disableAfterPriority ? [{ ...snapshots[0], delivered: 2 }, snapshots[1]]
            : enableDuringForce ? snapshots : [
              { ...snapshots[0], delivered: 2 }, { ...snapshots[1], delivered: 1 },
            ], 'ONLY deliveries must not consume the previous sequential schedule, even when A=B')
        })
      }
    }
  }
})

test('cold-lead automatic entry cannot deliver to an unselected buyer', async () => {
  const db = fixture({ pending: [{ ...lead, type: 'cold', status: 'new', assigned_to: null }] })
  assert.equal(await loadApp(db)('src/lib/cold-leads.ts').distributeColdLeads(outsider.id, 1, 'pt'), 0)
  assert.equal(db.calls.some((c: any) => c.ops?.some((o: any[]) => o[0] === 'update' && o[1].assigned_to)), false)
})

test('delivery queue exposes priority-only pending reason and hides outsiders/fallback for PT and ES', async () => {
  for (const language of ['pt', 'es']) {
    const db = fixture()
    const route = loadApp(db, { '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) } }) } })('src/app/api/admin/delivery-queue/route.ts')
    const response = await route.GET({ nextUrl: new URL('http://localhost?language=' + language) })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.priorityOnly, true)
    assert.match(body.pendingReason, /prioritário/)
    assert.deepEqual(body.fila, [])
    assert.deepEqual(body.admins, [])
  }
})

test('settings renders the administrative priority-only switch OFF by default with pending explanation', () => {
  const { LeadRoutingCard } = loadApp(fixture(), { '@/lib/supabase/client': {} })('src/app/admin/settings/lead-routing-card.tsx')
  const html = renderToStaticMarkup(createElement(LeadRoutingCard))
  assert.match(html, /Entregar somente aos prioritários/)
  assert.match(html, /role="switch"[^>]*aria-checked="false"/)
  assert.match(html, /pendentes/)
})

test('settings interaction blocks enabling with an unsaved selection, then saves selection before flag-only PATCH', async (t) => {
  let value: any = { mode: 'normal', priority_only: false, queue_order: 'credito', admin_rule: { admin_emails: [priority.email], one_in: 3 } }
  const writes: any[] = []
  const db = { from() {
    const ops: any[] = []
    const q: any = new Proxy({}, { get: (_, key) => key === 'then' ? (ok: any) => Promise.resolve().then(() => {
      const update = ops.find(o => o[0] === 'update')
      if (!update) return { data: { value: structuredClone(value) } }
      assert.ok(ops.some(o => o[0] === 'eq' && o[1] === 'value'), 'form still uses CAS')
      value = structuredClone(update[1].value); writes.push(value)
      return { data: { key: 'lead_routing' } }
    }).then(ok) : (...args: any[]) => { ops.push([key, ...args]); return q } })
    return q
  } }
  const patches: any[] = []
  t.mock.method(globalThis, 'fetch', async (_url: any, init: any) => {
    if (!init) return Response.json({ agents: [priority] })
    const body = JSON.parse(init.body); patches.push(body); value = { ...value, ...body }
    return Response.json({ priority_only: value.priority_only, admin_rule: value.admin_rule })
  })
  // Run the actual component and its handlers; only hook scheduling / I/O are
  // simulated, following the existing component tests (no browser DOM installed).
  const states: any[] = []; const effects: any[] = []; let cursor = 0; let mounted = false
  const hooks = {
    useState(initial: any) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (v: any) => { states[i] = typeof v === 'function' ? v(states[i]) : v }] },
    useEffect(fn: any) { if (!mounted) effects.push(fn) },
  }
  const { LeadRoutingCard } = loadApp(db, { react: hooks, '@/lib/supabase/client': { createClient: () => db } })('src/app/admin/settings/lead-routing-card.tsx')
  const render = () => { cursor = 0; const tree = LeadRoutingCard(); mounted = true; return tree }
  const nodes = (node: any): any[] => !node || typeof node !== 'object' ? [] : Array.isArray(node)
    ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  const control = (tree: any) => nodes(tree).find(n => n.props?.role === 'switch')
  render(); effects.forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve))
  let tree = render()
  assert.equal(control(tree).props.disabled, false)
  assert.match(renderToStaticMarkup(tree), /essa entrega não consome créditos/)
  nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange()
  tree = render()
  assert.equal(control(tree).props.disabled, true, 'cannot activate the saved A while displaying empty draft')
  assert.match(renderToStaticMarkup(tree), /não salv|rascunho/i)
  await control(tree).props.onClick() // defensive handler guard too
  assert.equal(patches.length, 0)
  await nodes(tree).find(n => n.type === 'button' && n.props.children === 'Salvar Roteamento').props.onClick()
  tree = render()
  assert.deepEqual(value.admin_rule.admin_emails, [])
  assert.equal(writes.length, 1)
  assert.equal(value.priority_only, false)
  assert.equal(control(tree).props.disabled, false)
  // Another tab saves a different selection while this tab has a clean draft.
  value.admin_rule = { admin_emails: [priority.email], one_in: 4 }
  await control(tree).props.onClick()
  tree = render()
  assert.deepEqual(patches, [{ priority_only: true }])
  assert.equal(control(tree).props['aria-checked'], true)
  assert.doesNotMatch(renderToStaticMarkup(tree), /essa entrega não consome créditos/)
  assert.match(renderToStaticMarkup(tree), /Funcionários selecionados também precisam de crédito no idioma do lead/)
  assert.equal(nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox').props.checked, true)
  assert.doesNotMatch(renderToStaticMarkup(tree), /Nenhum prioritário/)
  // Reconcile another clean change back to empty before exercising dirty draft.
  value.admin_rule = { admin_emails: [], one_in: 4 }
  await control(tree).props.onClick()
  tree = render()
  assert.equal(nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox').props.checked, false)
  await control(tree).props.onClick()
  tree = render()
  assert.match(renderToStaticMarkup(tree), /Nenhum prioritário/)
  // An unsaved addition must not hide the fact that the saved selection is empty.
  nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange()
  tree = render()
  assert.match(renderToStaticMarkup(tree), /Nenhum prioritário/)
  assert.match(renderToStaticMarkup(tree), /não salv|rascunho/i)
  value.admin_rule = { admin_emails: [outsider.email], one_in: 7 }
  await control(tree).props.onClick() // disabling is allowed with a dirty draft
  tree = render()
  assert.equal(control(tree).props['aria-checked'], false)
  assert.equal(nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox').props.checked, true, 'dirty local selection is not overwritten')
  assert.match(renderToStaticMarkup(tree), /não salv|rascunho/i)
})

test('admin switch persists only its flag with compare-and-swap, retaining concurrent rules and counters', async () => {
  const calls: any[] = []
  let value: any = { mode: 'sequential', steps: [{ delivered: 8 }], admin_rule: { admin_emails: [priority.email], one_in: 3 } }
  let conflicted = false
  const db = { from(table: string) {
    const ops: any[] = []
    const q: any = new Proxy({}, { get: (_, key) => key === 'then' ? (ok: any) => Promise.resolve().then(() => {
      calls.push({ table, ops })
      if (table === 'buyers') return { data: { is_admin: true } }
      const update = ops.find(o => o[0] === 'update')
      if (!update) return { data: { value: structuredClone(value) } }
      assert.ok(ops.some(o => o[0] === 'eq' && o[1] === 'value'), 'CAS required')
      if (!conflicted) { conflicted = true; value.steps[0].delivered = 9; return { data: null } }
      value = update[1].value
      return { data: { key: 'lead_routing' } }
    }).then(ok) : (...args: any[]) => { ops.push([key, ...args]); return q } })
    return q
  } }
  const route = loadApp(db, { '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) } }) } })('src/app/api/admin/priority-only/route.ts')
  const request = (flag: unknown) => new Request('http://localhost/api/admin/priority-only', { method: 'PATCH', body: JSON.stringify({ priority_only: flag }) })
  value.admin_rule.internal_test_field = 'must-not-be-returned'
  const response = await route.PATCH(request(true))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { priority_only: true, admin_rule: { admin_emails: [priority.email], one_in: 3 } })
  assert.equal(value.priority_only, true)
  assert.equal(value.steps[0].delivered, 9)
  assert.deepEqual(value.admin_rule, { admin_emails: [priority.email], one_in: 3, internal_test_field: 'must-not-be-returned' })
  assert.equal((await route.PATCH(request(false))).status, 200)
  assert.equal(value.priority_only, false)
  assert.equal((await route.PATCH(request('true'))).status, 400)
  for (const [user, admin, status] of [[null, false, 401], [{ id: 'customer' }, false, 403]] as const) {
    const deniedDb = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_admin: admin } }) }) }) }) }
    const denied = loadApp(deniedDb, { '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) } })('src/app/api/admin/priority-only/route.ts')
    assert.equal((await denied.PATCH(request(true))).status, status)
  }
})

test('priority-only respects availability and never falls back while every priority is outside its window', async () => {
  const db = fixture({ settings: { admin_rule: { admin_emails: [priority.email], one_in: 0 } },
    availability: [{ buyer_id: priority.id, day_type: 'never', period: 'morning', hours: [] }] })
  assert.equal(await loadApp(db)().distributeLeadToNextBuyer(lead), null)
})

test('priority-only keeps missing-state leads pending even for licensed buyers, consistent with no-license queue', async () => {
  for (const language of ['pt', 'es']) {
    for (const states of [[], [{ buyer_id: priority.id, state_code: 'FL' }]]) {
      const db = fixture({ states, settings: { admin_rule: { admin_emails: [priority.email] } },
        credits: [{ buyer_id: priority.id, type: 'lead', lead_language: language, total_purchased: 3, total_used: 0 }] })
      const app = loadApp(db, { '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) } }) } })
      for (const entry of ['tryAdminRule', 'forceAssignRoundRobin', 'distributeLeadToNextBuyer']) {
        assert.equal(await app()[entry]({ ...lead, state: '', lead_language: language }, {}), null)
      }
      assert.equal(db.calls.some((c: any) => c.rpc === 'assign_paid_lead_with_credit'), false)
      const response = await app('src/app/api/admin/delivery-queue/route.ts').GET({ nextUrl: new URL('http://localhost?language=' + language) })
      const body = await response.json()
      assert.equal(body.priorityOnly, true)
      if (!states.length) { assert.equal(body.admins[0].blockedReason, 'no_license'); assert.equal(body.admins[0].isNext, false) }
    }
  }
  const normal = fixture({ settings: { priority_only: false }, buyers: [outsider] })
  assert.equal((await loadApp(normal)().distributeLeadToNextBuyer({ ...lead, state: '' }))?.id, outsider.id)
})

test('priority-only blocks inactive, unlicensed, zero/negative credit and daily limits without any writes', async () => {
  for (const options of [
    { buyers: [{ ...priority, is_active: false }, outsider] },
    { states: [{ buyer_id: priority.id, state_code: 'NY' }] },
    { credits: [] },
    { credits: [{ buyer_id: priority.id, type: 'lead', lead_language: 'pt', total_purchased: 0, total_used: 1 }] },
    { daily_max: 0 }, { daily_max: 1, receivedToday: 1 },
  ]) {
    const db = fixture({ ...options, settings: { admin_rule: { admin_emails: [priority.email], one_in: 0, daily_max: options.daily_max } } })
    assert.equal(await loadApp(db)().distributeLeadToNextBuyer(lead), null)
    assert.equal(db.calls.some((c: any) => c.rpc === 'assign_paid_lead_with_credit'), false)
  }
})

test('settings failures abort every automatic entry instead of falling through; appointments stay untouched', async () => {
  for (const entry of ['distributeLeadToNextBuyer', 'forceAssignRoundRobin', 'tryAdminRule']) {
    const db = fixture({ settingsError: true })
    await assert.rejects(loadApp(db)()[entry](lead, entry === 'tryAdminRule' ? {} : [outsider.email]), /settings unavailable/)
    assert.equal(db.calls.some((c: any) => c.rpc), false)
  }
  const db = fixture({ settingsError: true })
  assert.equal(await loadApp(db)().distributeLeadToNextBuyer({ ...lead, product_type: 'appointment' }), null)
  assert.equal(db.calls.length, 0)
})

test('missing or disabled flag preserves the ordinary pool and fallback', async () => {
  for (const priority_only of [undefined, false]) {
    const db = fixture({ settings: { priority_only }, buyers: [outsider] })
    assert.equal((await loadApp(db)().distributeLeadToNextBuyer(lead))?.id, outsider.id)
  }
})

test('forced routing and proportional priority cannot bypass priority-only, including ES and stale rules', async () => {
  for (const language of ['pt', 'es']) {
    for (const entry of ['forceAssignRoundRobin', 'tryAdminRule']) {
      const db = fixture()
      const app = loadApp(db)()
      const result = await app[entry]({ ...lead, lead_language: language }, entry === 'tryAdminRule'
        ? { admin_emails: [outsider.email], one_in: 1 } : [outsider.email])
      assert.equal(result, null, entry)
      assert.equal(db.calls.some((c: any) => c.rpc === 'assign_paid_lead_with_credit'), false)
    }
  }
})

test('priority-only selects another eligible priority when the first is out of credits, in both languages', async () => {
  for (const language of ['pt', 'es']) {
    const db = fixture({
      settings: { admin_rule: { admin_emails: [outsider.email, priority.email], one_in: 20 } },
      credits: [{ buyer_id: priority.id, total_purchased: 2, total_used: 0, type: 'lead', lead_language: language }],
    })
    const result = await loadApp(db)().distributeLeadToNextBuyer({ ...lead, lead_language: language })
    assert.equal(result?.id, priority.id)
    assert.deepEqual(db.calls.filter((c: any) => c.rpc === 'assign_paid_lead_with_credit').map((c: any) => c.args), [
      { p_lead_id: lead.id, p_buyer_id: priority.id, p_language: language },
    ])
  }
})

test('priority-only with an empty selection leaves a system lead pending instead of assigning outside/fallback', async () => {
  const db = fixture()
  const result = await loadApp(db)().distributeLeadToNextBuyer(lead)
  assert.equal(result, null)
  assert.equal(db.calls.some((c: any) => c.rpc === 'assign_paid_lead_with_credit'), false)
  assert.equal(db.calls.some((c: any) => c.ops?.some((o: any[]) => o[0] === 'update')), false)
})
