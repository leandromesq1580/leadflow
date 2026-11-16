import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { transpileModule, ModuleKind } from 'typescript'

function fixture(options: { fail?: string; authorized?: boolean } = {}) {
  const rows = [
    { id: '00000000-0000-0000-0000-000000000001', twilio_sid: 'must-not-expose', lead_id: 'lead', direction: 'in', body: 'SMS reply', created_at: '2026-11-16T12:00:00Z', status: 'received', read_at: null },
    { id: '00000000-0000-0000-0000-000000000002', lead_id: 'lead', direction: 'out', body: 'SMS sent', created_at: '2026-11-16T11:00:00Z', status: 'sent', read_at: null },
  ]
  const calls: { name: string; args: Record<string, any> }[] = []
  const db = {
    rpc: async (name: string, args: Record<string, any>) => {
      calls.push({ name, args })
      if (options.fail === name) return { data: null, error: { message: 'offline failure' } }
      if (name === 'read_sms_inbox') return { data: rows.filter(r => (!args.p_after || r.id > args.p_after) && (!args.p_unread_only || r.direction === 'in' && !r.read_at)).slice(0, 1), error: null }
      if (name === 'mark_sms_inbox_read') { for (const row of rows) if (row.direction === 'in' && (!args.p_ids || args.p_ids.includes(row.id))) row.read_at = '2026-11-16T13:00:00Z' as any; return { data: 1, error: null } }
      throw Error(name)
    },
    from(table: string) {
      let after = '', updating = false
      const q = {
        select: () => q, eq: () => q, is: () => q, not: () => q, in: () => q, order: () => q, limit: () => q,
        gt: (_k: string, v: string) => { after = v; return q },
        update: () => { updating = true; return q },
        then: (ok: any, fail: any) => Promise.resolve({ data: updating ? [] : table === 'leads' && !after ? [{ id: 'lead', name: 'Synthetic' }] : [], error: options.fail === table ? {} : null }).then(ok, fail),
      }; return q
    },
  }
  const deps: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (b: unknown, o?: ResponseInit) => Response.json(b, o) } },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/api-auth': { callerBuyer: async () => ({ id: 'buyer', isAdmin: false }), canActAs: (_c: unknown, id: string) => options.authorized !== false && id === 'buyer' },
    '@/lib/lead-ownership': { assertBuyerOwnsLead: async () => ({ ok: options.authorized !== false }) },
    '@/lib/lead-message-locale': { leadMessageLocale: () => 'pt' },
    '@/lib/wa-bridge': {}, '@/lib/send-guard': {}, '@/lib/template-render': {},
  }
  function load(path: string): any {
    const mod = { exports: {} }
    new Function('require', 'module', 'exports', transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText)((name: string) => {
      if (name in deps) return deps[name]
      const target = name.startsWith('@/') ? resolve('src', name.slice(2)) : resolve(dirname(path), name)
      if (existsSync(target + '.ts')) return load(target + '.ts')
      throw Error(name)
    }, mod, mod.exports)
    return mod.exports
  }
  return { calls, rows, route: (endpoint: string) => load(resolve(`src/app/api/whatsapp/${endpoint}/route.ts`)) }
}
const req = (query = 'buyer_id=buyer') => new Request(`https://local.invalid/?${query}`)
test('SMS-only reply contributes to the existing unread badges', async () => {
  const f = fixture(); const r = await f.route('unread').GET(req())
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { counts: { lead: 1 }, total: 1 })
  assert.ok(f.calls.every(c => c.args.p_buyer_id === 'buyer'))
})
test('SMS-only conversation appears once with preview, date and unread', async () => {
  const f = fixture(); const r = await f.route('conversations').GET(req()); const { conversations } = await r.json()
  assert.equal(conversations.length, 1); assert.equal(conversations[0].last_body, 'SMS reply'); assert.equal(conversations[0].unread, 1)
})
test('thread retains real read_at and namespaced SMS IDs, exhausts short pages', async () => {
  const f = fixture(); const r = await f.route('messages').GET(req('lead_id=lead')); const { messages } = await r.json()
  assert.deepEqual(messages.map((m: any) => m.id), ['sms-00000000-0000-0000-0000-000000000002', 'sms-00000000-0000-0000-0000-000000000001']); assert.equal(messages[1].read_at, null)
  assert.equal(f.calls.filter(c => c.name === 'read_sms_inbox').length, 3)
})
test('buyer-wide unread message listing includes SMS', async () => {
  const f = fixture(); const r = await f.route('messages').GET(req()); const { messages } = await r.json()
  assert.deepEqual(messages.map((m: any) => m.id), ['sms-00000000-0000-0000-0000-000000000001'])
})
test('read acknowledgement updates SMS once and counts become zero', async () => {
  const f = fixture(); const api = f.route('messages')
  const r = await api.PATCH(new Request('https://local.invalid', { method: 'PATCH', body: JSON.stringify({ lead_id: 'lead', sms_ids: [f.rows[0].id] }) }))
  assert.equal(r.status, 200)
  assert.equal(f.rows[0].read_at, '2026-11-16T13:00:00Z'); assert.equal(f.rows[1].read_at, null)
  assert.deepEqual(await (await f.route('unread').GET(req())).json(), { counts: {}, total: 0 })
  const call = f.calls.find(c => c.name === 'mark_sms_inbox_read')!
  assert.equal(call.args.p_buyer_id, 'buyer'); assert.deepEqual(call.args.p_ids, [f.rows[0].id])
})
for (const endpoint of ['unread', 'messages', 'conversations']) test(`${endpoint}: SMS failure is unavailable, not false empty/success`, async () => {
  const f = fixture({ fail: 'read_sms_inbox' }); assert.equal((await f.route(endpoint).GET(req())).status, 503)
})
test('SMS read write errors are not acknowledged as success', async () => {
  const f = fixture({ fail: 'mark_sms_inbox_read' })
  assert.equal((await f.route('messages').PATCH(new Request('https://local.invalid', { method: 'PATCH', body: JSON.stringify({ buyer_id: 'buyer' }) }))).status, 503)
})
test('unauthorized buyer never reaches SMS reads/writes', async () => {
  const f = fixture({ authorized: false })
  for (const endpoint of ['unread', 'messages', 'conversations']) assert.equal((await f.route(endpoint).GET(req())).status, 403)
  assert.equal((await f.route('messages').PATCH(new Request('https://local.invalid', { method: 'PATCH', body: JSON.stringify({ lead_id: 'lead' }) }))).status, 403)
  assert.deepEqual(f.calls, [])
})

test('legacy thread PATCH without a snapshot cannot consume SMS', async () => {
  const f = fixture()
  const r = await f.route('messages').PATCH(new Request('https://local.invalid', {method:'PATCH',body:JSON.stringify({lead_id:'lead'})}))
  assert.equal(r.status,200); assert.equal(f.rows[0].read_at,null)
  assert.ok(!f.calls.some(c=>c.name==='mark_sms_inbox_read'))
})
test('malformed SMS snapshot is rejected before any database write', async () => {
  const f = fixture({fail:'whatsapp_messages'})
  const r = await f.route('messages').PATCH(new Request('https://local.invalid', {method:'PATCH',body:JSON.stringify({lead_id:'lead',sms_ids:['not-a-uuid']})}))
  assert.equal(r.status,400); assert.deepEqual(f.calls,[])
})
test('SMS history never serializes provider metadata', async () => {
  const f=fixture();const r=await f.route('messages').GET(req('lead_id=lead'))
  assert.ok(!(await r.text()).includes('must-not-expose'))
})
