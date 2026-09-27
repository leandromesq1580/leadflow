const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Carrega TS real com require/import dinâmico mockados (mesmo padrão dos outros testes).
function load(relative, mocks = {}, globals = {}) {
  const filename = path.join(__dirname, '..', relative)
  const dir = path.dirname(relative)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  const req = name => name in mocks ? mocks[name] : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`, mocks, globals) : (name.startsWith('./') || name.startsWith('../')) ? load(path.normalize(path.join(dir, name)) + '.ts', mocks, globals) : require(name)
  vm.runInNewContext(code, { module, exports: module.exports, Response, AbortSignal, setTimeout, console: { ...console, log() {}, warn() {}, error() {} }, process: { env: globals.env || {} }, fetch: globals.fetch, Promise, require: req }, { filename })
  return module.exports
}

// bridges: principal (:3457 = piroli) fora; reserva admin (:3466) pronta; um admin sem bridge; um admin com bridge morta
const admins = [
  { name: 'Regiane Piroli', wa_bridge_url: 'http://62.146.229.13:3457', wa_bridge_key: 'k-piroli', wa_bridge_phone: '17867442126' },
  { name: 'Lead4Pro', wa_bridge_url: 'http://62.146.229.13:3466', wa_bridge_key: 'k-regiane', wa_bridge_phone: '18632808696' },
  { name: 'Leandro', wa_bridge_url: 'http://62.146.229.13:3460', wa_bridge_key: 'k-leandro', wa_bridge_phone: '18632808023' },
]
function world({ ready = { ':3466': true } } = {}) {
  const calls = []
  const fetch = async (url, init) => {
    const port = ':' + new URL(url).port
    if (url.endsWith('/status')) return new Response(JSON.stringify({ ready: !!ready[port], hasQR: !ready[port] }), { status: 200 })
    if (url.endsWith('/send')) {
      calls.push({ port, key: init.headers.apikey, body: JSON.parse(init.body) })
      return ready[port] ? new Response(JSON.stringify({ success: true, id: 'x' }), { status: 200 }) : new Response(JSON.stringify({ error: 'Not connected' }), { status: 503 })
    }
    throw new Error('url inesperada ' + url)
  }
  const db = { from() { const q = { select() { return q }, eq() { return q }, not() { return q }, then: r => r({ data: admins, error: null }) }; return q } }
  const sms = []
  const mocks = {
    resend: { Resend: class { constructor() { this.emails = { send: async () => ({}) } } } },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/twilio': { twilioConfigured: () => true, toE164: p => '+' + String(p).replace(/\D/g, ''), sendSms: async (to, body) => { sms.push({ to, body }); return { ok: true, sid: 'SM1' } } },
    '@/lib/push-notify': { pushToBuyer: async () => {} },
  }
  const env = { WA_BRIDGE_URL: 'http://62.146.229.13:3457', WA_BRIDGE_KEY: 'k-piroli', ADMIN_WHATSAPP: '18632808023' }
  const bridge = load('src/lib/wa-bridge.ts', mocks, { fetch, env })
  mocks['@/lib/wa-bridge'] = bridge
  const notif = load('src/lib/notifications.ts', mocks, { fetch, env })
  return { calls, sms, bridge, notif, db }
}

test('pickFallbackBridge: só admins com bridge ready, nunca o que falhou (3457≡3456)', async () => {
  const w = world({ ready: { ':3466': true, ':3457': true } })
  const fb = await w.bridge.pickFallbackBridge(w.db, 'http://62.146.229.13:3457')
  assert.equal(fb.phone, '18632808696')
  const fb2 = await w.bridge.pickFallbackBridge(w.db, 'http://62.146.229.13:3456/')
  assert.equal(fb2.phone, '18632808696')
  w.bridge._resetFallbackCache()
  const none = world({ ready: {} })
  assert.equal(await none.bridge.pickFallbackBridge(none.db, 'http://62.146.229.13:3457'), null)
})

test('aviso ao grupo com a bridge principal fora sai pela reserva (linha 8696) e NÃO manda SMS', async () => {
  const w = world()
  const r = await w.notif.notifyAdmins('⚠️ teste')
  assert.equal(r.groupOk, true); assert.equal(r.directOk, true)
  // 2 tentativas na principal (:3457) por destino + 1 na reserva (:3466) por destino
  assert.deepEqual(w.calls.map(c => c.port), [':3457', ':3457', ':3466', ':3457', ':3457', ':3466'])
  assert.equal(w.calls[2].key, 'k-regiane'); assert.equal(w.calls[2].body.number, '120363403347083071@g.us')
  assert.equal(w.calls[5].body.number, '18632808023')
  assert.equal(w.sms.length, 0)
})

test('WhatsApp inteiro fora (principal e reserva) → alarme vai por SMS pro admin', async () => {
  const w = world({ ready: {} })
  const r = await w.notif.notifyAdmins('🚨 caiu tudo *negrito*')
  assert.equal(r.groupOk, false); assert.equal(r.directOk, false)
  assert.equal(w.sms.length, 1); assert.equal(w.sms[0].to, '+18632808023'); assert.match(w.sms[0].body, /^Lead4Pro: 🚨 caiu tudo negrito/)
  // reserva não tem reserva: nenhuma tentativa em bridge que não seja admin/ready, sem loop
  assert.ok(w.calls.length <= 4, 'sem loop de fallback: ' + w.calls.length)
})

test('reconciliação do poll-leads olha 72h (não mais 6h)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/app/api/poll-leads/route.ts'), 'utf8')
  assert.match(src, /const cutoff = new Date\(Date\.now\(\) - 72 \* 3600_000\)\.toISOString\(\)/)
  assert.doesNotMatch(src, /Date\.now\(\) - 6 \* 3600_000/)
})
