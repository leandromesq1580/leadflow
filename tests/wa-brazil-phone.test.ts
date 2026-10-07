/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { createClient } from '@supabase/supabase-js'
import * as routing from '../src/lib/wa-conversation-routing'
import * as content from '../src/lib/wa-message-content'
import * as history from '../src/lib/wa-message-history'

// Fictional fixtures only. No bridge, database, or message transport is contacted.
const short = '556998765432', long = '5569998765432'
const bridgeShort = '551198765430', bridgeLong = '5511998765430'
const at = '2026-09-07T20:46:24.000Z'
const lead = (id = 'lead', phone = long, owner = 'agency', member: string | null = null) => ({
  id, phone, phone_digits: phone.replace(/\D/g, ''), name: 'Synthetic contact',
  assigned_to: owner, assigned_to_member: member, created_at: at, assigned_at: null,
})
const buyer = (id = 'agency', phone = bridgeLong) => ({
  id, wa_bridge_phone: phone, is_admin: false, is_active: false, auth_user_id: `${id}-auth`,
})
const outbound = (id: string, lead_id: string, buyer_id = 'agency', from_phone = bridgeLong, sent_at = '2026-09-07T20:40:00.000Z') => ({
  id, lead_id, buyer_id, from_phone, to_phone: long, sent_at, direction: 'out',
  status: 'sent', body: 'Synthetic send', wa_message_id: `true_${id}`, media_url: null,
})
function load(path: string, dependencies: Record<string, any>, globals: Record<string, any> = {}) {
  const js = transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, jsx: JsxEmit.ReactJSX },
  }).outputText
  const compiledModule = { exports: {} as any }
  new Function('require', 'module', 'exports', ...Object.keys(globals), js)((name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`)
    return dependencies[name]
  }, compiledModule, compiledModule.exports, ...Object.values(globals))
  return compiledModule.exports
}

// Real Supabase serializer + synthetic HTTP transport that APPLIES every filter.
// Unknown operators fail, rather than silently handing the handler canned rows.
function fixture(options: { leads?: any[]; buyers?: any[]; messages?: any[]; caller?: any; allowed?: boolean; recipientPageCap?: number; failRecipientAfter?: string } = {}) {
  const rows: Record<string, any[]> = {
    leads: options.leads || [lead()], buyers: options.buyers || [buyer()],
    team_members: [{ id: 'member', auth_user_id: 'member-auth' }],
    whatsapp_messages: structuredClone(options.messages || []), sms_messages: [], client_messages: [],
  }
  const queries: { table: string; method: string; params: URLSearchParams }[] = []
  const pushes: any[] = []
  function condition(row: any, field: string, filter: string): boolean {
    const dot = filter.indexOf('.'), op = filter.slice(0, dot), value = filter.slice(dot + 1)
    const actual = row[field]
    if (op === 'eq') return String(actual) === value
    if (op === 'is') { assert.equal(value, 'null'); return actual == null }
    if (op === 'in') return value.slice(1, -1).split(',').map(v => v.replace(/^"|"$/g, '')).includes(String(actual))
    if (op === 'gt') return actual > value
    if (op === 'gte') return actual >= value
    if (op === 'lte') return actual <= value
    if (op === 'ilike') return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, 'i').test(String(actual))
    throw new Error(`Unsupported fixture operator ${op}`)
  }
  const db = createClient('https://supabase.example.invalid', 'synthetic-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input: any, init: any) => {
      const url = new URL(String(input)), table = url.pathname.split('/').at(-1)!
      assert.ok(table in rows, `Unexpected table ${table}`)
      const params = url.searchParams, method = init.method || 'GET'
      queries.push({ table, method, params })
      const recipientScan = table === 'buyers' && params.get('select') === 'id,wa_bridge_phone' && !params.has('id') ||
        table === 'buyers' && params.get('id')?.startsWith('gt.')
      if (recipientScan && options.failRecipientAfter && params.get('id') === `gt.${options.failRecipientAfter}`) {
        return Response.json({ code: 'XX000', message: 'Synthetic later-page failure' }, { status: 400 })
      }
      const matches = (row: any) => [...params].every(([field, value]) => {
        if (['select', 'order', 'limit'].includes(field)) return true
        if (field === 'or') return value.slice(1, -1).split(',').some(c => {
          const dot = c.indexOf('.'); return condition(row, c.slice(0, dot), c.slice(dot + 1))
        })
        return condition(row, field, value)
      })
      let result = rows[table].filter(matches)
      if (params.has('order')) {
        const [field, direction] = params.get('order')!.split('.')
        result.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (direction === 'desc' ? -1 : 1))
      }
      if (params.has('limit')) result = result.slice(0, Number(params.get('limit')))
      if (recipientScan && options.recipientPageCap) result = result.slice(0, options.recipientPageCap)
      if (method === 'POST') {
        const inserted = { id: `saved-${rows[table].length}`, sent_at: at, ...JSON.parse(init.body) }
        rows[table].push(inserted); result = [inserted]
      } else if (method === 'PATCH') {
        const update = JSON.parse(init.body); result.forEach(row => Object.assign(row, update))
      } else assert.equal(method, 'GET')
      const single = new Headers(init.headers).get('accept')?.includes('vnd.pgrst.object')
      return new Response(JSON.stringify(single ? result[0] || null : result), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } },
  })
  const dependencies = {
    'next/server': { NextResponse: Response }, '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/wa-conversation-routing': routing, '@/lib/wa-message-content': content,
    '@/lib/buyer-locale': { localeDoBuyer: async () => 'pt', trad: () => (pt: string) => pt },
    '@/lib/push-notify': { pushToBuyer: async (...args: any[]) => { pushes.push(args) } },
  }
  const post = load('../src/app/api/webhook/wa-bridge/route.ts', dependencies).POST
  const get = load('../src/app/api/whatsapp/messages/route.ts', {
    ...dependencies, '@/lib/send-guard': {}, '@/lib/wa-bridge': {}, '@/lib/template-render': {},
    '@/lib/wa-message-history': history,
    '@/lib/api-auth': { callerBuyer: async () => options.caller === null ? null : options.caller || { id: 'agency', isAdmin: false }, canActAs: (caller: any, id: string) => caller.id === id },
    '@/lib/lead-ownership': { assertBuyerOwnsLead: async () => ({ ok: options.allowed !== false }) },
  }).GET
  return { rows, queries, pushes, async send(overrides: Record<string, unknown> = {}) {
    return post(new Request('https://example.invalid/api/webhook/wa-bridge', {
      method: 'POST', headers: { apikey: process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026', 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_message_id: 'false_synthetic', from: short, to: bridgeShort, direction: 'in', body: 'Synthetic reply', type: 'chat', timestamp: Date.parse(at) / 1000, bridge_owner_buyer_id: 'agency', ...overrides }),
    }))
  }, get: (query = 'lead_id=lead') => get(new Request(`https://example.invalid/api/whatsapp/messages?${query}`)) }
}

test('strict Brazil equivalence is symmetric, formatted and confined to a plausible mobile after the same DDD', () => {
  assert.ok(routing.sameWhatsAppPhone(short, long))
  assert.ok(routing.sameWhatsAppPhone('+55 (69) 99876-5432', short))
  assert.ok(routing.sameWhatsAppPhone(long, short))
  for (const [a, b] of [
    [short, '5568998765432'], [short, '5469998765432'], [short, '1556998765432'],
    ['556938765432', '5569938765432'], ['550098765432', '5500998765432'],
    [short, '5569987659432'], ['6998765432', long], ['5569987654320', long],
    ['551198765432', short], ['', ''],
  ]) assert.equal(routing.sameWhatsAppPhone(a, b), false, `${a} must not match ${b}`)
  assert.ok(routing.sameWhatsAppPhone('7865550101', '+1 (786) 555-0101'))
})

test('real webhook retrieves both Brazil forms through applied Supabase phone_digits filters', async () => {
  for (const [stored, incoming] of [[long, short], [short, long], ['+55 (69) 99876-5432', short]]) {
    const f = fixture({ leads: [lead('lead', stored)] })
    const r = await f.send({ from: incoming })
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { success: true, lead_id: 'lead', buyer_id: 'agency' })
    assert.equal(f.rows.whatsapp_messages[0].from_phone, incoming)
    assert.deepEqual(f.pushes.map(p => p[0]), ['agency'])
    assert.equal(f.rows.leads[0].phone, stored, 'do not rewrite phone')
    assert.equal(f.rows.leads[0].assigned_to, 'agency')
  }
})

test('foreign suffixes, DDD collisions, fixed lines and misplaced ninth digits are not lead candidates', async () => {
  for (const [stored, incoming] of [[long, '5469998765432'], [long, '5568998765432'], [long, '15569998765432'], ['5569938765432', '556938765432'], [long, '5569987659432']]) {
    const f = fixture({ leads: [lead('lead', stored)] }); const r = await f.send({ from: incoming })
    assert.equal((await r.json()).skipped, 'no_lead')
    assert.equal(f.rows.whatsapp_messages.length, 0); assert.equal(f.pushes.length, 0)
  }
})

test('recipient Brazil variant resolves only a unique owner; ambiguous and foreign bridge suffixes fail closed', async () => {
  const f = fixture(); assert.equal((await (await f.send({ bridge_owner_buyer_id: undefined })).json()).success, true)
  for (const buyers of [[buyer(), buyer('other')], [buyer('agency', '5411998765430')]]) {
    const x = fixture({ buyers }); const response = await x.send({ bridge_owner_buyer_id: undefined, to: bridgeLong })
    assert.equal((await response.json()).skipped, 'no_bridge_owner'); assert.equal(x.rows.whatsapp_messages.length, 0)
  }
})

test('legacy recipient formatting cannot hide a second canonical buyer (P1)', async () => {
  for (const phone of ['+1 7865550101', '+1 (786) 555-0101', '1-786-555-0101']) {
    const f = fixture({ buyers: [buyer('agency', '17865550101'), buyer('other', phone)] })
    assert.deepEqual(await (await f.send({ to: '17865550101', bridge_owner_buyer_id: undefined })).json(), { skipped: 'no_bridge_owner' })
    assert.equal(f.queries.filter(q => q.method !== 'GET').length, 0)
    assert.equal(f.pushes.length, 0)
  }
})

test('unique exact or formatted recipient stays routable, including NANP and Brazil aliases (P2)', async () => {
  for (const [stored, incoming] of [
    ['17865550101', '17865550101'], ['+1 7865550101', '17865550101'],
    ['+1 (786) 555-0101', '7865550101'], ['(786) 555-0101', '17865550101'],
    ['+55 (11) 99876-5430', bridgeShort], ['+55 (11) 9876-5430', bridgeLong],
  ]) {
    const f = fixture({ buyers: [buyer('agency', stored)] })
    assert.deepEqual(await (await f.send({ to: incoming, bridge_owner_buyer_id: undefined })).json(), { success: true, lead_id: 'lead', buyer_id: 'agency' })
    assert.deepEqual(f.pushes.map(p => p[0]), ['agency'], 'multiple strict aliases still identify just one buyer')
  }
})

const recipientQueries = (f: ReturnType<typeof fixture>) => f.queries.filter(q =>
  q.table === 'buyers' && q.params.get('select') === 'id,wa_bridge_phone' && !q.params.get('id')?.startsWith('in.'),
)
const fillerBuyers = () => Array.from({ length: 251 }, (_, i) => buyer(`b${String(i).padStart(3, '0')}`, '5411998765430'))

test('recipient scan consumes ordered pages through empty page, even below requested page cap', async () => {
  for (const recipientPageCap of [undefined, 2]) for (const stored of ['17865550101', '+1 (786) 555-0101']) {
    const f = fixture({ buyers: [...fillerBuyers(), buyer('z-owner', stored)],
      leads: [lead('lead', long, 'z-owner')], recipientPageCap })
    assert.equal((await (await f.send({ to: '17865550101', bridge_owner_buyer_id: undefined })).json()).buyer_id, 'z-owner')
    const queries = recipientQueries(f)
    assert.ok(queries.length > 2)
    assert.equal(queries.at(-1)!.params.get('id'), 'gt.z-owner')
    for (const q of queries) {
      assert.equal(q.params.get('order'), 'id.asc')
      assert.equal(q.params.get('limit'), '250')
      assert.equal(q.params.has('wa_bridge_phone'), false, 'no textual prefilter can hide legacy formatting')
    }
    assert.equal(queries.filter(q => !q.params.has('id')).length, 1, 'one scan, not one scan per alias')
  }
})

test('canonical duplicate before or beyond recipient page boundary remains ambiguous', async () => {
  for (const otherId of ['a-other', 'z-other']) {
    const f = fixture({ buyers: [buyer('agency', bridgeLong), ...fillerBuyers(), buyer(otherId, '+55 (11) 9876-5430')] })
    assert.deepEqual(await (await f.send({ to: bridgeLong, bridge_owner_buyer_id: undefined })).json(), { skipped: 'no_bridge_owner' })
    assert.equal(f.queries.filter(q => q.method !== 'GET').length, 0)
    assert.equal(f.pushes.length, 0)
    assert.ok(recipientQueries(f).length >= 3)
  }
})

test('recipient failure on any later page discards even an already unique or ambiguous match', async () => {
  for (const explicitOwner of [undefined, 'agency']) for (const ambiguous of [false, true]) {
    const f = fixture({ buyers: [buyer('agency'), buyer('other', ambiguous ? bridgeShort : '5411998765430')],
      recipientPageCap: 1, failRecipientAfter: ambiguous ? 'other' : 'agency' })
    assert.equal((await f.send({ bridge_owner_buyer_id: explicitOwner })).status, 500)
    assert.equal(f.queries.filter(q => q.method !== 'GET').length, 0)
    assert.equal(f.pushes.length, 0)
  }
})

test('recipient normalization never matches a different country, DDD or national-only Brazil input', async () => {
  for (const stored of ['+54 (11) 99876-5430', '+55 (21) 99876-5430', '(11) 99876-5430']) {
    const f = fixture({ buyers: [buyer('agency', stored)] })
    assert.deepEqual(await (await f.send({ to: bridgeLong, bridge_owner_buyer_id: undefined })).json(), { skipped: 'no_bridge_owner' })
    assert.equal(f.pushes.length, 0)
  }
})

test('explicit owner preserves delegation and scope despite canonical recipient ambiguity', async () => {
  for (const owner of ['agency', 'stranger']) {
    const f = fixture({ buyers: [buyer(), buyer('other', '+55 (11) 9876-5430'), buyer('member', '+55 (11) 99876-5430')],
      leads: [lead('delegated', long, 'agency', 'member')], recipientPageCap: 1 })
    const result = await (await f.send({ bridge_owner_buyer_id: owner })).json()
    assert.deepEqual(result, owner === 'agency' ? { success: true, lead_id: 'delegated', buyer_id: 'member' } : { skipped: 'not_owner_lead' })
    assert.deepEqual(f.pushes.map(p => p[0]), owner === 'agency' ? ['member'] : [])
    assert.equal(recipientQueries(f).filter(q => !q.params.has('id')).length, 1)
  }
})

test('variant never grants another owner access and delegation still wins over agency/recipient', async () => {
  const stranger = fixture({ leads: [lead('stranger', long, 'other')] })
  assert.equal((await (await stranger.send()).json()).skipped, 'not_owner_lead')
  assert.equal(stranger.pushes.length, 0)
  for (const bridgeOwner of ['agency', 'member']) {
    const f = fixture({ leads: [lead('delegated', long, 'agency', 'member')], buyers: [buyer(), buyer('member')] })
    assert.equal((await (await f.send({ bridge_owner_buyer_id: bridgeOwner })).json()).buyer_id, 'member')
    assert.equal(f.rows.whatsapp_messages[0].lead_id, 'delegated')
    assert.deepEqual(f.pushes.map(p => p[0]), ['member'])
  }
})

test('outgoing ranking applies sender variants before LIMIT, excluding future and wrong-owner evidence', async () => {
  const f = fixture({
    leads: [lead('current', short), lead('delegated', short, 'agency', 'member')], buyers: [buyer(), buyer('member')],
    messages: [outbound('a', 'current', 'agency', bridgeShort, '2026-09-07T20:45:00.000Z'), outbound('b', 'delegated', 'member'),
      outbound('future', 'delegated', 'member', bridgeLong, '2026-09-07T21:00:00.000Z'),
      outbound('wrong', 'delegated', 'other', bridgeLong, '2026-09-07T20:46:00.000Z'),
      outbound('foreign', 'delegated', 'member', '5411998765430', '2026-09-07T20:46:00.000Z')],
  })
  const response = await f.send({ to: bridgeLong })
  assert.deepEqual(await response.json(), { success: true, lead_id: 'current', buyer_id: 'agency' })
})

test('duplicate ID, own echo and technical events have no repeated persistence or notification', async () => {
  const f = fixture(); await f.send(); const repeated = await f.send()
  assert.equal((await repeated.json()).skipped, 'duplicate')
  assert.equal(f.rows.whatsapp_messages.length, 1); assert.equal(f.pushes.length, 1)
  for (const overrides of [{ wa_message_id: 'true_echo' }, { type: 'e2e_notification' }, { type: 'ciphertext' }]) {
    const x = fixture(); assert.equal((await (await x.send(overrides)).json()).skipped, 'non_message')
    assert.equal(x.queries.length, 0); assert.equal(x.pushes.length, 0)
  }
  const pending = { ...outbound('pending', 'lead'), wa_message_id: null, sent_at: new Date().toISOString() }
  const x = fixture({ messages: [pending] })
  assert.deepEqual(await (await x.send({ direction: 'out', from: bridgeShort, to: short, body: pending.body, wa_message_id: 'true_sent' })).json(), { merged: 'pending' })
  assert.equal(x.rows.whatsapp_messages.length, 1); assert.equal(x.pushes.length, 0)
})

test('real UI history GET returns both phone forms by authorized lead ID, never unrelated messages', async () => {
  const f = fixture({ messages: [
    { ...outbound('a', 'lead'), body: 'Synthetic short variant', direction: 'in', from_phone: short, wa_message_id: 'false_a' },
    { ...outbound('b', 'lead'), body: 'Synthetic long variant', direction: 'in', from_phone: long, wa_message_id: 'false_b' },
    { ...outbound('c', 'other'), body: 'Unrelated private fixture', direction: 'in', from_phone: short, wa_message_id: 'false_c' },
  ] })
  assert.deepEqual((await (await f.get()).json()).messages.map((m: any) => m.id), ['a', 'b'])
  assert.equal((await fixture({ allowed: false }).get()).status, 403)
  assert.equal((await fixture({ caller: null }).get()).status, 401)
  // Execute the actual component loader and render its resulting state. Only
  // hooks, realtime and HTTP IO are isolated; no reconstructed inbox markup.
  const states: any[] = [], refs: any[] = [], effects: (() => any)[] = []
  let stateIndex = 0, refIndex = 0
  let loaded!: () => void
  const finished = new Promise<void>(resolve => { loaded = resolve })
  const Inbox = load('../src/components/whatsapp-inbox.tsx', {
    'react/jsx-runtime': jsxRuntime,
    react: {
      useState: (initial: any) => {
        const index = stateIndex++
        if (!(index in states)) states[index] = initial
        return [states[index], (value: any) => {
          states[index] = typeof value === 'function' ? value(states[index]) : value
          if (index === 5 && value === false) loaded()
        }]
      },
      useRef: (initial: any) => { const index = refIndex++; return refs[index] ||= { current: initial } },
      useEffect: (effect: () => any) => { effects.push(effect) },
    },
    '@/lib/use-realtime': { useRealtime: () => {} },
    '@/lib/i18n-client': { useT: () => ({ _locale: 'pt' }) },
    '@/lib/florida-time': { FLORIDA_TIME_ZONE: 'America/New_York' },
  }, {
    fetch: async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return Response.json({ success: true })
      assert.equal(url, '/api/whatsapp/messages?lead_id=lead')
      return f.get()
    },
    setInterval: () => 0, clearInterval: () => {},
  }).WhatsAppInbox
  Inbox({ leadId: 'lead', buyerId: 'agency' })
  const cleanup = effects[0]()
  await finished
  stateIndex = 0; refIndex = 0
  const html = renderToStaticMarkup(Inbox({ leadId: 'lead', buyerId: 'agency' }))
  assert.match(html, /Synthetic short variant/)
  assert.match(html, /Synthetic long variant/)
  assert.doesNotMatch(html, /Unrelated private fixture/)
  cleanup()
})
