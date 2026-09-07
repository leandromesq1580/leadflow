import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ModuleKind, transpileModule } from 'typescript'
import * as routing from '../src/lib/wa-conversation-routing'

const bridgePhone = '17865550101'
const otherPhone = '14425550102'
const at = '2026-09-07T20:46:24.999Z'
const candidate = (id: string, owner = 'agency', member: string | null = null) => ({
  id, assigned_to: 'agency', assigned_to_member: member ? 'team-member' : null,
  memberBuyerId: member, ownerBuyerId: owner, name: 'Synthetic contact',
  created_at: id === 'old' ? '2026-05-29T00:00:00Z' : '2026-08-30T00:00:00Z',
  assigned_at: null, phone: '18435550103',
})
const old = candidate('old', 'member', 'member')
const current = candidate('current')
const outgoing = (lead_id = 'current', buyer_id = 'agency', sent_at = '2026-09-07T20:23:42Z', from_phone = bridgePhone) => ({
  lead_id, buyer_id, sent_at, from_phone,
})
const input = (overrides: Partial<Parameters<typeof routing.selectWhatsAppConversation>[0]> = {}) => ({
  candidates: [old, current], bridgeOwner: 'agency', bridgePhone, recipientBuyerId: null,
  ownerBridgePhones: new Map([['agency', bridgePhone], ['member', otherPhone]]),
  outbound: [outgoing()], cutoff: at, ...overrides,
})

test('duplicate contact: reply follows the current conversation, not the older delegated lead', () => {
  const picked = routing.selectWhatsAppConversation(input())
  assert.equal(picked?.id, 'current')
  assert.equal(picked?.ownerBuyerId, 'agency')
})

test('previously misrouted phone-origin output does not reinforce the wrong thread', () => {
  assert.equal(routing.selectWhatsAppConversation(input({
    outbound: [outgoing(), outgoing('old', 'member', '2026-09-07T20:40:00Z')],
  }))?.id, 'current')
})

test('single delegated lead still belongs to the member, even on the agency bridge', () => {
  const picked = routing.selectWhatsAppConversation(input({ candidates: [old], recipientBuyerId: 'agency' }))
  assert.equal(picked?.id, 'old')
  assert.equal(picked?.ownerBuyerId, 'member')
})

test('member own bridge routes to the member and never the unrelated agency copy', () => {
  assert.equal(routing.selectWhatsAppConversation(input({ bridgeOwner: 'member', bridgePhone: otherPhone }))?.id, 'old')
})

test('intentional shared bridge uses latest outgoing context without overriding member ownership', () => {
  const picked = routing.selectWhatsAppConversation(input({
    ownerBridgePhones: new Map([['agency', bridgePhone], ['member', bridgePhone]]),
    outbound: [outgoing(), outgoing('old', 'member', '2026-09-07T20:40:00Z')],
  }))
  assert.equal(picked?.id, 'old')
  assert.equal(picked?.ownerBuyerId, 'member')
})

test('legacy CRM sends without from_phone use the verified owner bridge', () => {
  assert.equal(routing.selectWhatsAppConversation(input({ outbound: [outgoing('current', 'agency', '2026-09-07T20:23:42Z', '')] }))?.id, 'current')
})

test('another sender or buyer cannot be used as conversation evidence', () => {
  const shared = new Map([['agency', bridgePhone], ['member', bridgePhone]])
  for (const untrusted of [outgoing('old', 'unrelated', '2026-09-07T20:40:00Z'), outgoing('old', 'member', '2026-09-07T20:40:00Z', otherPhone)]) {
    assert.equal(routing.selectWhatsAppConversation(input({ ownerBridgePhones: shared, outbound: [outgoing(), untrusted] }))?.id, 'current')
  }
})

test('same phone and recent messages from another account never cross the bridge owner boundary', () => {
  const stranger = { ...candidate('stranger', 'stranger'), assigned_to: 'stranger' }
  assert.equal(routing.selectWhatsAppConversation(input({
    candidates: [stranger, old, current],
    ownerBridgePhones: new Map([['stranger', bridgePhone]]),
    outbound: [outgoing('stranger', 'stranger', '2026-09-07T20:45:00Z')],
  }))?.id, 'old')
  assert.equal(routing.selectWhatsAppConversation(input({ candidates: [stranger] })), null)
})

test('without message evidence, bridge affinity wins; legacy member fallback remains deterministic', () => {
  assert.equal(routing.selectWhatsAppConversation(input({ outbound: [] }))?.id, 'current')
  assert.equal(routing.selectWhatsAppConversation(input({ outbound: [], ownerBridgePhones: new Map() }))?.id, 'old')
})

test('backfill cannot be routed using a conversation started after the historical reply', () => {
  assert.equal(routing.selectWhatsAppConversation(input({
    ownerBridgePhones: new Map([['agency', bridgePhone], ['member', bridgePhone]]),
    outbound: [outgoing(), outgoing('old', 'member', '2026-09-07T21:09:00Z')],
  }))?.id, 'current')
  assert.equal(routing.whatsappEventCutoff(Date.parse('2026-09-07T20:46:24Z') / 1000, Date.parse(at)), at)
  assert.equal(routing.whatsappEventCutoff(undefined, 10000), '1970-01-01T00:00:10.999Z')
})

test('phone comparison accepts formatting and NANP national format but not foreign suffix collisions', () => {
  assert.ok(routing.sameWhatsAppPhone('+1 (786) 555-0101', bridgePhone))
  assert.ok(routing.sameWhatsAppPhone('7865550101', bridgePhone))
  assert.equal(routing.sameWhatsAppPhone('557865550101', bridgePhone), false)
  assert.equal(routing.sameWhatsAppPhone('', null), false)
})

type Query = { table: string; calls: [string, ...any[]][] }
function database(resolve: (query: Query) => any) {
  const queries: Query[] = []
  return { queries, from(table: string) {
    const q: Query = { table, calls: [] }; queries.push(q)
    const chain: any = new Proxy({}, { get: (_, key) => key === 'then'
      ? (accept: any, reject: any) => Promise.resolve(resolve(q)).then(accept, reject)
      : (...args: any[]) => { q.calls.push([String(key), ...args]); return chain } })
    return chain
  } }
}
function loadWebhook(db: any, notifications: any[]) {
  const dependencies: Record<string, any> = {
    'next/server': { NextResponse: Response },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/buyer-locale': { localeDoBuyer: async () => 'pt', trad: () => (pt: string) => pt },
    '@/lib/wa-conversation-routing': routing,
    '@/lib/push-notify': { pushToBuyer: async (...args: any[]) => { notifications.push(args) } },
  }
  const js = transpileModule(readFileSync(new URL('../src/app/api/webhook/wa-bridge/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: 7 },
  }).outputText
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', js)((name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports.POST
}
const has = (q: Query, method: string, field?: string) => q.calls.find(c => c[0] === method && (field === undefined || c[1] === field))
function fixture(options: { shared?: boolean; failContext?: boolean; failInsert?: boolean; leads?: any[]; duplicate?: boolean } = {}) {
  const inserted: any[] = []; const notifications: any[] = []
  const db = database(q => {
    if (q.table === 'buyers') {
      if (has(q, 'in', 'auth_user_id')) return { data: [{ id: 'member', auth_user_id: 'member-auth' }] }
      if (has(q, 'in', 'id')) return { data: [
        { id: 'agency', wa_bridge_phone: bridgePhone },
        { id: 'member', wa_bridge_phone: options.shared ? bridgePhone : otherPhone },
      ] }
      if (has(q, 'eq', 'is_active')) return { data: [] }
      if (has(q, 'eq', 'id')) return { data: { is_admin: false } }
      // Production bridge is intentionally shared; no arbitrary first-row choice.
      return { data: [{ id: 'agency' }, { id: 'shared-colleague' }] }
    }
    if (q.table === 'leads') return { data: has(q, 'update') ? null : options.leads || [old, current] }
    if (q.table === 'team_members') return { data: [{ id: 'team-member', auth_user_id: 'member-auth' }] }
    if (q.table === 'whatsapp_messages') {
      const write = has(q, 'insert')
      if (write) { inserted.push(write[1]); return { error: options.failInsert ? { code: '08006', message: 'Synthetic DB failure' } : null } }
      if (has(q, 'eq', 'wa_message_id')) return { data: options.duplicate ? { id: 'existing', media_url: null } : null }
      if (has(q, 'is', 'wa_message_id')) return { data: null }
      if (options.failContext) return { error: { code: '08006', message: 'Synthetic context failure' } }
      assert.ok(has(q, 'lte', 'sent_at'), 'outgoing context must be bounded by message timestamp')
      assert.ok(has(q, 'eq', 'buyer_id'), 'context must be scoped to the real owner')
      const id = has(q, 'eq', 'lead_id')?.[2]
      return { data: id === 'old' ? [outgoing('old', 'member', '2026-09-07T20:40:00Z')] : [outgoing()] }
    }
    throw new Error(`Unexpected table ${q.table}`)
  })
  const post = loadWebhook(db, notifications)
  return { db, inserted, notifications, async send(overrides = {}, key = process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026') {
    return post(new Request('https://example.invalid/api/webhook/wa-bridge', {
      method: 'POST', headers: { apikey: key.trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_message_id: 'fixture-message', from: '18435550103', to: bridgePhone,
        body: 'Synthetic reply', bridge_owner_buyer_id: 'agency', timestamp: Date.parse(at) / 1000, ...overrides }),
    }))
  } }
}

test('webhook persists duplicate-phone reply in the right lead and notifies only its owner', async () => {
  const f = fixture(); const response = await f.send()
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, lead_id: 'current', buyer_id: 'agency' })
  assert.equal(f.inserted.length, 1)
  assert.equal(f.inserted[0].lead_id, 'current')
  assert.equal(f.inserted[0].body, 'Synthetic reply')
  assert.deepEqual(f.notifications.map(n => n[0]), ['agency'])
})

test('webhook respects the shared-bridge member conversation', async () => {
  const f = fixture({ shared: true }); await f.send()
  assert.equal(f.inserted[0].lead_id, 'old')
  assert.equal(f.inserted[0].buyer_id, 'member')
})

test('phone-origin outgoing replies follow the same thread, without inbound push', async () => {
  const f = fixture(); const response = await f.send({ direction: 'out', from: bridgePhone, to: '18435550103' })
  assert.equal(response.status, 200)
  assert.equal(f.inserted[0].lead_id, 'current')
  assert.equal(f.inserted[0].direction, 'out')
  assert.equal(f.notifications.length, 0)
})

test('webhook does not query disambiguation context for a unique delegated lead', async () => {
  const f = fixture({ leads: [old], failContext: true }); await f.send()
  assert.equal(f.inserted[0].buyer_id, 'member')
})

test('context and persistence failures return 500, never false success or a wrong fallback', async () => {
  for (const option of [{ failContext: true }, { failInsert: true }]) {
    const f = fixture(option); const response = await f.send()
    assert.equal(response.status, 500)
    assert.equal(f.notifications.length, 0)
    if (option.failContext) assert.equal(f.inserted.length, 0)
  }
})

test('duplicate webhook delivery is idempotent and sends no new notification', async () => {
  const f = fixture({ duplicate: true }); const response = await f.send()
  assert.equal((await response.json()).skipped, 'duplicate')
  assert.equal(f.inserted.length, 0); assert.equal(f.notifications.length, 0)
})

test('unrelated bridge owner or ambiguous ownerless shared bridge cannot capture a lead conversation', async () => {
  for (const owner of ['stranger', undefined]) {
    const f = fixture(); const response = await f.send({ bridge_owner_buyer_id: owner })
    assert.match((await response.json()).skipped, /not_owner_lead|no_bridge_owner/)
    assert.equal(f.inserted.length, 0)
  }
})

test('webhook rejects unauthorized requests before any database query', async () => {
  const f = fixture(); const response = await f.send({}, 'wrong-key')
  assert.equal(response.status, 401); assert.equal(f.db.queries.length, 0)
})
