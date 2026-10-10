import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ModuleKind, transpileModule } from 'typescript'
import * as language from '../src/lib/lead-message-locale'

// Pedido do dono (09/10/2026): o aviso "NOVO LEAD RECEBIDO" do grupo admin precisa dizer
// QUAL CRIATIVO (anúncio) converteu o lead. O Meta já entrega ad_name; fica em leads.raw_data.
// Regra: só o grupo admin vê o criativo — comprador/membro não (dado interno de marketing).

const contact = { id: 'fixture-lead', name: 'Synthetic Contact', phone: '15555551001', city: '', state: 'FL', interest: 'Seguro de vida' }
const buyer = { id: 'fixture-buyer', name: 'Synthetic Buyer', email: 'buyer@example.invalid', phone: '15555551002', notification_phone_2: null }
const member = { id: 'fixture-member', name: 'Synthetic Member', email: 'member@example.invalid', phone: '15555551004', whatsapp: null, auth_user_id: 'fixture-auth' }

function fixture(t: any, source: Record<string, unknown> | null) {
  const whatsapp: any[] = [], queries: any[] = []
  const db = { from(table: string) {
    const calls: any[] = []; queries.push({ table, calls })
    const chain: any = new Proxy({}, { get: (_, key) => key === 'then'
      ? (resolve: any) => {
        const write = calls.find(c => c[0] === 'update')
        return Promise.resolve({ data: write ? null : table === 'leads' ? source : { id: 'fixture-member-buyer' }, error: null }).then(resolve)
      }
      : (...args: any[]) => { calls.push([key, ...args]); return chain } })
    return chain
  } }
  const previous = { WA_BRIDGE_URL: process.env.WA_BRIDGE_URL, WHATSAPP_ADMIN_GROUP: process.env.WHATSAPP_ADMIN_GROUP, ADMIN_WHATSAPP: process.env.ADMIN_WHATSAPP }
  process.env.WA_BRIDGE_URL = 'https://bridge.example.invalid'
  process.env.WHATSAPP_ADMIN_GROUP = 'fixture-group@g.us'
  process.env.ADMIN_WHATSAPP = '15555551005'
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  })
  t.mock.method(globalThis, 'fetch', async (url: string, options: any) => {
    assert.equal(url, 'https://bridge.example.invalid/send')
    whatsapp.push(JSON.parse(options.body))
    return Response.json({ success: true, id: 'fixture-ack' })
  })
  const dependencies: Record<string, any> = {
    resend: { Resend: class { emails = { send: async () => ({ error: null }) } } },
    './buyer-locale': { localeDoBuyer: async () => 'pt', trad: () => (pt: string) => pt },
    './insurance-policies': {},
    './lead-message-locale': language,
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/push-notify': { pushToBuyer: async () => 1 },
  }
  const js = transpileModule(readFileSync(new URL('../src/lib/notifications.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: 7 },
  }).outputText
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', js)((name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return { api: module.exports, whatsapp, queries }
}

const meta = { meta_lead_id: 'fixture-meta', lead_language: 'pt', form_name: null, campaign_name: 'CAMPANHA FIXTURE', raw_data: { ad_name: 'Criativo Fixture BR', adset_name: 'Conjunto Fixture' } }

test('delivery alert to the admin group names the creative; buyer alert does not', async t => {
  const f = fixture(t, meta)
  await f.api.sendLeadNotificationEmail(buyer, contact)
  assert.deepEqual(f.whatsapp.map(m => m.number), ['fixture-group@g.us', '15555551005', buyer.phone])
  for (const m of f.whatsapp.slice(0, 2)) {
    assert.ok(m.message.includes('🎨 Criativo: Criativo Fixture BR'), `admin alert must name the creative:\n${m.message}`)
    assert.ok(m.message.includes('📣 Campanha: CAMPANHA FIXTURE'))
    assert.ok(m.message.indexOf('🎨') < m.message.indexOf('👤 Distribuido para'), 'creative goes right after the lead block')
  }
  assert.ok(!f.whatsapp[2].message.includes('Criativo'), 'buyer alert must not expose the creative')
  const select = f.queries.find(q => q.table === 'leads').calls.find((c: any[]) => c[0] === 'select')[1]
  assert.ok(select.includes('raw_data') && select.includes('campaign_name'), 'hydration must fetch the creative from the canonical row')
})

test('creative missing on the row is stated explicitly, never invented', async t => {
  const f = fixture(t, { ...meta, raw_data: {}, campaign_name: null })
  await f.api.sendLeadNotificationEmail(buyer, contact)
  for (const m of f.whatsapp.slice(0, 2)) {
    assert.ok(m.message.includes('🎨 Criativo: não informado pelo Meta'), m.message)
    assert.ok(!m.message.includes('📣 Campanha'), 'no campaign line when the row has none')
  }
})

test('pending (undistributed) lead alert also names the creative', async t => {
  const f = fixture(t, null)
  await f.api.notifyGroupLeadPending({ ...contact, lead_language: 'pt', campaign_name: 'CAMPANHA FIXTURE', raw_data: { ad_name: 'Criativo Fixture BR' } })
  assert.equal(f.whatsapp.length, 2)
  for (const m of f.whatsapp) assert.ok(m.message.includes('🎨 Criativo: Criativo Fixture BR'), m.message)
})

test('team member alert does not expose the creative', async t => {
  const f = fixture(t, meta)
  await f.api.sendTeamMemberNotification(member, contact)
  assert.equal(f.whatsapp.length, 1)
  assert.ok(!f.whatsapp[0].message.includes('Criativo'))
})
