import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ModuleKind, JsxEmit, transpileModule } from 'typescript'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { SCRIPT_IUL_PADRAO } from '../src/lib/call-script'

const buyer = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
function load(path: string, deps: Record<string, unknown>) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
  const js = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX } }).outputText
  const m = { exports: {} as Record<string, any> }
  new Function('require', 'module', 'exports', js)((name: string) => {
    if (name === '@/lib/buyer-features') return load('lib/buyer-features.ts', {})
    assert.ok(name in deps, `Unexpected dependency: ${name}`)
    return deps[name]
  }, m, m.exports)
  return m.exports
}
function fixture(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial))
  const writes: any[] = []
  let failure = false
  const db = { from(table: string) {
    let keys: string[] = [], id = ''
    const chain: any = {
      select() { return chain }, single() { return chain.maybeSingle() },
      eq(field: string, value: string) { if (field === 'key') keys = [value]; else id = value; return chain },
      in(_field: string, values: string[]) { keys = values; return chain },
      maybeSingle() { return Promise.resolve(failure ? { data: null, error: { message: 'fixture DB error' } } : { data: table === 'buyers' ? ([buyer, other].includes(id) ? { id } : null) : (values.has(keys[0]) ? { key: keys[0], value: values.get(keys[0]) } : null), error: null }) },
      upsert(row: any) { writes.push(row); if (!failure) values.set(row.key, row.value); return Promise.resolve({ error: failure ? { message: 'fixture DB error' } : null }) },
      then(resolve: any, reject: any) { return Promise.resolve(failure ? { data: null, error: { message: 'fixture DB error' } } : { data: keys.filter(k => values.has(k)).map(k => ({ key: k, value: values.get(k) })), error: null }).then(resolve, reject) },
    }
    return chain
  } }
  return { db, values, writes, fail() { failure = true } }
}
export { fixture, load, buyer, other }
const next = { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } }
function callScript(f: ReturnType<typeof fixture>) {
  return load('app/api/call-script/route.ts', {
    'next/server': next,
    '@/lib/supabase/admin': { createAdminClient: () => f.db },
    '@/lib/api-auth': { callerBuyer: async () => ({ id: buyer, isAdmin: false }) },
    '@/lib/call-script': { SCRIPT_IUL_PADRAO },
  })
}

test('admin block overrides paid IA access in the actual call-script response', async () => {
  const f = fixture({ ia_ligacao_addon: { [buyer]: { active: true } }, [`buyer_feature:ia_ligacao:${buyer}`]: { mode: 'disabled' } })
  const r = await callScript(f).GET()
  assert.equal(r.status, 200)
  assert.equal((await r.json()).ia.ativa, false)
})

function featureRoute(f: ReturnType<typeof fixture>, actor: { id: string; isAdmin: boolean } | null = { id: other, isAdmin: true }) {
  return load('app/api/admin/buyers/[id]/features/route.ts', {
    'next/server': next,
    '@/lib/supabase/admin': { createAdminClient: () => f.db },
    '@/lib/api-auth': { callerBuyer: async () => actor },
  })
}
function body(feature: unknown = 'ia_ligacao', mode: unknown = 'enabled') {
  return new Request('https://example.invalid/api/admin/buyers/features', { method: 'POST', body: JSON.stringify({ feature, mode }), headers: { 'Content-Type': 'application/json' } })
}
const params = { params: Promise.resolve({ id: buyer }) }

test('admin can grant, block and restore default for only the selected buyer, with audit and readback', async () => {
  const f = fixture({ ia_ligacao_addon: { [buyer]: { active: true } }, [`buyer_feature:ia_ligacao:${other}`]: { mode: 'disabled' } })
  const route = featureRoute(f)
  for (const [mode, enabled] of [['enabled', true], ['disabled', false], ['default', true]] as const) {
    const r = await route.POST(body('ia_ligacao', mode), params)
    assert.equal(r.status, 200)
    assert.equal((await r.json()).features[0].enabled, enabled)
    const stored: any = f.values.get(`buyer_feature:ia_ligacao:${buyer}`)
    assert.equal(stored.mode, mode)
    assert.equal(stored.updated_by, other)
    assert.ok(Number.isFinite(Date.parse(stored.updated_at)))
    assert.deepEqual(f.values.get(`buyer_feature:ia_ligacao:${other}`), { mode: 'disabled' })
    assert.deepEqual(f.values.get('ia_ligacao_addon'), { [buyer]: { active: true } })
  }
})
test('unauthenticated and ordinary users cannot read or change overrides', async () => {
  for (const actor of [null, { id: buyer, isAdmin: false }]) {
    const f = fixture(), route = featureRoute(f, actor)
    assert.equal((await route.POST(body(), params)).status, actor ? 403 : 401)
    assert.equal((await route.GET(body(), params)).status, actor ? 403 : 401)
    assert.equal(f.writes.length, 0)
  }
})
test('invalid feature/mode/ID/JSON and missing buyer never write settings', async () => {
  const f = fixture(), route = featureRoute(f)
  for (const req of [body('unknown'), body('ia_ligacao', true), body('ia_ligacao', 'surprise'), new Request('https://example.invalid', { method: 'POST', body: '{' })]) {
    assert.equal((await route.POST(req, params)).status, 400)
  }
  assert.equal((await route.POST(body(), { params: Promise.resolve({ id: 'bad' }) })).status, 400)
  assert.equal((await route.POST(body(), { params: Promise.resolve({ id: '33333333-3333-4333-8333-333333333333' }) })).status, 404)
  assert.equal(f.writes.length, 0)
})
test('storage failure is not reported as a successful admin change', async () => {
  const f = fixture(); f.fail()
  assert.equal((await featureRoute(f).POST(body(), params)).status, 503)
})

function outbound(f: ReturnType<typeof fixture>) {
  return load('app/api/voice/outbound/route.ts', {
    'next/server': {}, '@/lib/supabase/admin': { createAdminClient: () => f.db },
    '@/lib/twilio': { toE164: (s: string) => s },
    '@/lib/voice': { pickCallerId: async () => '+15555550123', validVoiceSignature: () => true, xmlEscape: (s: string) => s.replaceAll('&', '&amp;'), VOICE_TRANSCRIPTION_URL: 'https://example.invalid/transcription', VOICE_STATUS_URL: 'https://example.invalid/status', VOICE_RECORDING_URL: 'https://example.invalid/recording', VOICE_WHISPER_URL: 'https://example.invalid/whisper', VOICE_OUTBOUND_URL: 'https://example.invalid/outbound' },
  })
}
function voiceRequest(from = buyer, claimed = from) {
  return new Request('https://example.invalid/outbound', { method: 'POST', body: new URLSearchParams({ From: `client:${from}`, buyerId: claimed, To: '+15555550124', leadId: '' }).toString() })
}
test('admin block stops actual TwiML transcription but keeps ordinary Dial and recording', async () => {
  const f = fixture({ ia_ligacao_addon: { [buyer]: { active: true } }, [`buyer_feature:ia_ligacao:${buyer}`]: { mode: 'disabled' } })
  const xml = await (await outbound(f).POST(voiceRequest())).text()
  assert.ok(!xml.includes('<Transcription'))
  assert.ok(xml.includes('<Dial'))
  assert.ok(xml.includes('record-from-answer-dual'))
})
test('admin grant activates actual TwiML without a subscription; other buyers cannot borrow its identity', async () => {
  const f = fixture({ [`buyer_feature:ia_ligacao:${buyer}`]: { mode: 'enabled' } })
  assert.ok((await (await outbound(f).POST(voiceRequest())).text()).includes('<Transcription'))
  assert.ok(!(await (await outbound(f).POST(voiceRequest(other, buyer))).text()).includes('<Transcription'))
})
test('IA gate fails closed on storage failure, preserving the phone call', async () => {
  const f = fixture(); f.fail()
  const xml = await (await outbound(f).POST(voiceRequest())).text()
  assert.ok(!xml.includes('<Transcription'))
  assert.ok(xml.includes('<Dial'))
})

test('default preserves subscription and legacy courtesy; grants and blocks do not affect others', async () => {
  const { readBuyerFeatures, hasCallIA } = load('lib/buyer-features.ts', {})
  for (const initial of [{}, { ia_ligacao_addon: { [buyer]: { active: true } } }, { call_transcription: { buyers: [buyer] } }]) {
    const f = fixture(initial)
    assert.equal((await readBuyerFeatures(f.db, buyer))[0].mode, 'default')
    assert.equal(await hasCallIA(f.db, buyer), Object.keys(initial).length > 0)
    assert.equal(await hasCallIA(f.db, other), false)
  }
  const f = fixture({ [`buyer_feature:ia_ligacao:${buyer}`]: { mode: 'corrupted' }, ia_ligacao_addon: { [buyer]: { active: true } } })
  assert.equal(await hasCallIA(f.db, buyer), false)
})

test('blocking IA stops suggestion generation even with an enabled script and a cached suggestion', async t => {
  const f = fixture({ [`buyer_feature:ia_ligacao:${buyer}`]: { mode: 'disabled' }, [`call_transcript:CAfixture`]: { meta: { buyer_id: buyer }, linhas: [{ quem: 'cliente', texto: 'teste' }], assist: { em: new Date().toISOString(), apos_linha: 1, sugestao: 'cached' } }, [`call_script:${buyer}`]: { enabled: true } })
  const old = process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = 'fixture-not-a-real-key'
  t.after(() => { if (old === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = old })
  let requests = 0
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('Unexpected external call') })
  const engine = load('lib/call-assist.ts', { '@/lib/supabase/admin': { createAdminClient: () => f.db }, '@/lib/call-script': { SCRIPT_IUL_PADRAO } })
  assert.equal(await engine.avaliarConversa('CAfixture'), null)
  assert.equal(requests, 0)
})

test('blocked IA hides cached suggestions through the actual polling API', async () => {
  const f = fixture({ [`buyer_feature:ia_ligacao:${buyer}`]: { mode: 'disabled' }, [`call_transcript:CA123456789012345`]: { meta: { buyer_id: buyer }, assist: { sugestao: 'cached' } } })
  const route = load('app/api/call-assist/route.ts', { 'next/server': next, '@/lib/supabase/admin': { createAdminClient: () => f.db }, '@/lib/api-auth': { callerBuyer: async () => ({ id: buyer }), canActAs: (_c: unknown, id: string) => id === buyer } })
  const r = await route.GET(new Request('https://example.invalid/call-assist?call=CA123456789012345'))
  assert.equal((await r.json()).assist, null)
})

test('admin controls render the existing IA permission, three modes and an explicit billing notice', () => {
  const { BuyerFeatureControls } = load('app/admin/buyers/[id]/feature-controls.tsx', { react: React, 'react/jsx-runtime': jsxRuntime, 'next/navigation': { useRouter: () => ({ refresh() {} }) } })
  for (const mode of ['default', 'enabled', 'disabled']) {
    const html = renderToStaticMarkup(React.createElement(BuyerFeatureControls, { buyerId: buyer, initialFeatures: [{ id: 'ia_ligacao', label: 'Ligação com IA', mode, enabled: mode !== 'disabled', source: 'admin' }] }))
    assert.match(html, /Ligação com IA/)
    for (const label of ['Padrão', 'Liberado', 'Bloqueado']) assert.ok(html.includes(label))
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1)
    assert.ok(html.includes('cobrança'))
    for (const unsupported of ['text-muted-foreground', 'text-destructive', 'border-border', 'bg-muted']) assert.ok(!html.includes(unsupported))
    assert.ok(html.includes('bg-slate-100'))
    assert.ok(html.includes('bg-white shadow-sm text-slate-900'))
  }
  const unavailable = renderToStaticMarkup(React.createElement(BuyerFeatureControls, { buyerId: buyer, initialFeatures: null }))
  assert.ok(unavailable.includes('consultar'))
  assert.ok(!unavailable.includes('aria-pressed'))
})

test('admin block also rejects buying the IA add-on; admin grant avoids duplicate subscription', async () => {
  for (const [mode, status] of [['disabled', 403], ['enabled', 400]] as const) {
    const f = fixture({ [`buyer_feature:ia_ligacao:${buyer}`]: { mode } })
    const route = load('app/api/roteiro/checkout/route.ts', {
      'next/server': next, '@/lib/supabase/admin': { createAdminClient: () => f.db },
      '@/lib/supabase/server': { createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: buyer } } }) } }) },
      '@/lib/policies': { hasAcceptedCurrentPolicy: async () => true },
      '@/lib/locale': { getLocale: async () => 'pt' },
      '@/lib/checkout-policy': { checkoutPolicyMetadata: async () => ({}), stripeTermsConsent: {} },
      '@/lib/stripe': { getStripe: () => { throw new Error('Stripe must not be called') } },
    })
    assert.equal((await route.POST(new Request('https://example.invalid', { method: 'POST', body: '{"accept_policy":true}' }))).status, status)
    assert.equal(f.writes.length, 0)
  }
})

