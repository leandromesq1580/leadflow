const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(relative, mocks = {}, globals = {}) {
  const filename = path.join(__dirname, '..', relative)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, console, Response, URL,
    require: name => name in mocks ? mocks[name] : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`, mocks) : require(name),
    ...globals,
  }, { filename })
  return module.exports
}
const { canReclaimTeamLead: canReclaim, reclaimError } = load('src/lib/team-reclaim.ts')
const member = { id: 'member', buyer_id: 'owner' }
const owner = { id: 'owner', isAdmin: false }
const admin = { ...owner, isAdmin: true }
test('owner can reclaim their delegated lead, even when member has no buyer account', () => {
  assert.equal(canReclaim(owner, { assigned_to: 'owner', assigned_to_member: 'member' }, member, null), true)
})
test('admin sees reclaim for direct employee assignments (screenshot regression)', () => {
  assert.equal(canReclaim(admin, { assigned_to: 'employee', assigned_to_member: null }, member, 'employee'), true)
})
test('visibility does not grant access to member personal leads or other teams', () => {
  assert.equal(canReclaim(owner, { assigned_to: 'employee' }, member, 'employee'), false)
  assert.equal(canReclaim(admin, { assigned_to: 'employee' }, { ...member, buyer_id: 'other' }, 'employee'), false)
  assert.equal(canReclaim(admin, { assigned_to: 'other-account' }, member, 'employee'), false)
})
test('stale member, missing ownership, and already-owned lead hide reclaim', () => {
  assert.equal(canReclaim(admin, { assigned_to: 'employee', assigned_to_member: 'different' }, member, 'employee'), false)
  assert.equal(canReclaim(admin, { assigned_to: null }, member, 'employee'), false)
  assert.equal(canReclaim(admin, { assigned_to: 'owner', assigned_to_member: null }, member, 'employee'), false)
})
test('all failure messages exist in Portuguese, English and Spanish', () => {
  for (const code of ['FORBIDDEN', 'NO_PIPELINE', 'CONFLICT', 'ARCHIVED', 'UNAUTHORIZED', 'RECLAIM_FAILED']) {
    const translations = ['pt', 'en', 'es'].map(locale => reclaimError(code, locale))
    assert.equal(new Set(translations).size, 3)
    assert.ok(translations.every(s => s.length > 10))
  }
})

const leadId = '11111111-1111-4111-8111-111111111111'
const memberId = '22222222-2222-4222-8222-222222222222'
function route({ caller = owner, data = { ok: true }, error = null, throws = false } = {}) {
  const calls = []
  const db = { async rpc(name, args) { calls.push({ name, args }); if (throws) throw Error('offline'); return { data, error } } }
  const { POST } = load('src/app/api/team/reclaim/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/api-auth': { callerBuyer: async () => caller },
  })
  return { calls, invoke: body => POST({ json: async () => body }) }
}
test('reclaim endpoint rejects unauthenticated callers before any database mutation', async () => {
  const r = route({ caller: null }); assert.equal((await r.invoke({ lead_id: leadId })).status, 401); assert.equal(r.calls.length, 0)
})
test('reclaim endpoint validates identifiers', async () => {
  for (const body of [null, {}, { lead_id: 'bad' }, { lead_id: leadId, member_id: 'bad' }]) {
    const r = route(); assert.equal((await r.invoke(body)).status, 400); assert.equal(r.calls.length, 0)
  }
})
test('owner comes from authenticated session, never client-supplied identity', async () => {
  const r = route(); const res = await r.invoke({ lead_id: leadId, member_id: memberId, buyer_id: 'victim', p_actor_buyer_id: 'victim' })
  assert.equal(res.status, 200); assert.equal(r.calls.length, 1)
  assert.equal(r.calls[0].name, 'reclaim_team_lead')
  assert.equal(r.calls[0].args.p_actor_buyer_id, owner.id)
  assert.equal(r.calls[0].args.p_member_id, memberId)
  assert.equal(res.headers.get('cache-control'), 'private, no-store')
})
test('RPC failures and conflicts never masquerade as successful reclaim', async () => {
  for (const [code, status] of [['NOT_FOUND', 404], ['FORBIDDEN', 403], ['CONFLICT', 409], ['ARCHIVED', 409], ['NO_PIPELINE', 409]]) {
    const res = await route({ data: { ok: false, code } }).invoke({ lead_id: leadId })
    assert.equal(res.status, status); assert.equal((await res.json()).code, code)
  }
  assert.equal((await route({ error: { code: 'TEST_FAILURE' } }).invoke({ lead_id: leadId })).status, 500)
})

function menu(locale, response, props = {}) {
  const states = [true, false, false, '', 'down']; let cursor = 0; let refreshed = 0; const requests = []
  const react = { useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], v => { states[i] = v }] }, useRef: () => ({ current: null }), useLayoutEffect() {} }
  const { CardAssignMenu } = load('src/app/dashboard/pipeline/card-assign-menu.tsx', {
    react, '@/lib/i18n-client': { useT: () => ({ _locale: locale }) },
  }, { fetch: async (url, init) => { requests.push({ url, body: JSON.parse(init.body) }); return response } })
  function render() { cursor = 0; return CardAssignMenu({ leadId, members: [{ id: memberId, name: 'Fictional employee' }], canReclaim: true, viewedMemberId: memberId, currentMemberId: null, onAssigned: () => refreshed++, ...props }) }
  function nodes(node) { if (!node || typeof node !== 'object') return []; return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)] }
  function button() { return nodes(render()).find(n => n.type === 'button' && String(n.props.children).startsWith('←')) }
  return { states, requests, render, nodes, button, refreshed: () => refreshed }
}
test('menu displays reclaim for direct employee lead in all three languages', () => {
  for (const [locale, label] of [['pt', '← Voltar pra mim'], ['en', '← Back to me'], ['es', '← Devolver a mí']]) {
    assert.equal(menu(locale).button().props.children, label)
  }
  assert.equal(menu('pt', null, { canReclaim: false }).button(), undefined)
})
test('menu passes viewed member context and refreshes only after successful transaction', async () => {
  const m = menu('pt', { ok: true, json: async () => ({ ok: true }) })
  m.button().props.onClick({ preventDefault() {}, stopPropagation() {} })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(m.requests[0].url, '/api/team/reclaim'); assert.equal(m.requests[0].body.member_id, memberId)
  assert.equal(m.refreshed(), 1); assert.equal(m.states[0], false)
})
test('menu keeps failure visible and does not refresh or hide the lead', async () => {
  const m = menu('es', { ok: false, json: async () => ({ code: 'FORBIDDEN' }) })
  m.button().props.onClick({ preventDefault() {}, stopPropagation() {} })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(m.refreshed(), 0); assert.equal(m.states[0], true)
  assert.equal(m.nodes(m.render()).find(n => n.props?.role === 'alert').props.children, reclaimError('FORBIDDEN', 'es'))
})
