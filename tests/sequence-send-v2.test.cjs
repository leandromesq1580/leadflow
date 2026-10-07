/* eslint-disable @typescript-eslint/no-require-imports -- Offline real-handler harness. */
// Every identity, body, receipt, key and clock here is SYNTHETIC. No network/server.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const operation = '00000000-0000-4000-8000-000000000010'
const sender = '15555550100'
const contract = { version: 2, operation_id: operation, sender }
const body = { number: '15555550200', message: 'SYNTHETIC message', sequence: contract }
function load(file, deps = {}, globals = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require: name => { assert.ok(Object.hasOwn(deps, name), name); return deps[name] }, console, Date, Intl, Response, AbortSignal, ...globals }, { filename: file })
  return module.exports
}
function transport(scenario = 'confirmed') {
  const source = fs.readFileSync('infra/vps/wa-bridge-server.js', 'utf8')
  const start = source.indexOf('app.post("/send",')
  const code = source.slice(source.indexOf('function withTimeout('), source.indexOf('// Limpa locks Singleton')) + source.slice(start, source.indexOf('\nclient.initialize();', start))
  const state = { sends: 0, reads: 0, lookups: 0, timers: [], posts: 0 }
  let handler
  let identity = sender
  vm.runInNewContext(code, {
    app: { post: (_p, fn) => { handler = fn } }, console: { log() {}, warn() {}, error() {} },
    INSTANCE_NAME: 'SYNTHETIC', isReady: scenario !== 'pre_503', myNumber: () => identity,
    tryGetChatId: async () => { state.lookups++; if (scenario === 'identity_change') identity = '15555550999'; return scenario === 'pre_404' ? null : body.number + '@c.us' },
    client: {
      sendMessage: async () => { state.sends++; if (scenario === 'throw') throw Error('SYNTHETIC after invocation'); if (scenario === 'timeout') return new Promise(resolve => { state.release = () => resolve({ id: { _serialized: 'synthetic-late' } }) }); return ['noack', 'old_ack'].includes(scenario) ? undefined : { id: { _serialized: scenario === 'null_id' ? null : 'synthetic-current' } } },
      getChatById: async () => { state.reads++; return { fetchMessages: async () => [{ fromMe: true, id: { _serialized: 'synthetic-unrelated' } }] } },
    }, markBridgeSend() {}, recover() {}, setTimeout: (fn, ms) => { state.timers.push({ fn, ms }); return 1 },
  })
  const invoke = async (request = body) => {
    let status = 200, payload
    const res = { status(n) { status = n; return this }, json(p) { payload = p; return this } }
    await handler({ body: request }, res)
    return Response.json(payload, { status })
  }
  return { state, invoke }
}
for (const [scenario, code, status] of [['pre_503', 'bridge_not_ready', 503], ['pre_404', 'recipient_unavailable', 404]]) {
  test(`v2 ${scenario}: correlated proof and zero sendMessage`, async () => {
    const t = transport(scenario), r = await t.invoke(), p = await r.json()
    assert.equal(r.status, status); assert.equal(t.state.sends, 0)
    assert.deepEqual(p.sequence, { ...contract, outcome: 'rejected_before_send', code })
    assert.equal(p.success, false); assert.equal(p.id, null)
  })
}
test('v2 confirmation uses only this invocation; legacy fallback is unchanged', async () => {
  for (const scenario of ['confirmed', 'noack', 'old_ack', 'null_id', 'throw']) {
    const t = transport(scenario), p = await (await t.invoke()).json()
    assert.equal(t.state.sends, 1); assert.equal(t.state.reads, 0)
    assert.equal(p.sequence.outcome, scenario === 'confirmed' ? 'confirmed' : 'unknown')
    assert.equal(p.id, scenario === 'confirmed' ? 'synthetic-current' : null)
  }
  const manual = transport('old_ack')
  const p = await (await manual.invoke({ number: body.number, message: body.message })).json()
  assert.equal(p.id, 'synthetic-unrelated'); assert.equal(manual.state.reads, 1)
})
test('v2 rejects malformed opt-in/identity/body before effects; never downgrades to manual', async () => {
  for (const sequence of [null, {}, { ...contract, version: 1 }, { ...contract, operation_id: 'bad' }, { ...contract, sender: '15555550999' }]) {
    const t = transport(), r = await t.invoke({ ...body, sequence })
    assert.equal(r.status, 400); assert.equal(t.state.sends, 0); assert.equal(t.state.lookups, 0)
    assert.equal((await r.json()).sequence, undefined)
  }
  for (const invalid of [{ number: null }, { number: '15555550200@g.us' }, { message: '' }, { mediaUrl: 'https://synthetic.invalid' }]) {
    const t = transport(), p = await (await t.invoke({ ...body, ...invalid })).json()
    assert.equal(t.state.sends, 0); assert.equal(t.state.lookups, 0)
    assert.equal(p.sequence.outcome, 'rejected_before_send'); assert.equal(p.sequence.code, 'invalid_payload')
  }
  const t = transport('identity_change'), p = await (await t.invoke()).json()
  assert.equal(t.state.sends, 0); assert.notEqual(p.sequence?.outcome, 'confirmed')
  assert.notEqual(p.sequence?.outcome, 'rejected_before_send')
})
test('v2 timeout is unknown; underlying promise can still complete without a replay', async () => {
  const t = transport('timeout'), pending = t.invoke()
  while (!t.state.release) await Promise.resolve()
  assert.equal(t.state.timers[0].ms, 45000); t.state.timers[0].fn()
  const p = await (await pending).json(); assert.equal(p.sequence.outcome, 'unknown')
  t.state.release(); await Promise.resolve(); assert.equal(t.state.sends, 1)
})
module.exports = { load, transport, contract, body, sender, operation }

async function runEngine(mode, scenario, options = {}) {
  const t = transport(scenario), calls = []
  const enrollment = { id: '00000000-0000-4000-8000-000000000011', buyer_id: 'synthetic-buyer', lead_id: 'synthetic-lead', sequence_id: 'synthetic-sequence', lease_token: operation, enrolled_at: '2026-10-07T12:00:00.000Z', current_step: 0, recent_choices: [] }
  const bridge = { url: 'https://synthetic.invalid', key: 'synthetic-not-secret', phone: sender, ownerBuyerId: enrollment.buyer_id }
  const request = async (url, init) => {
    if (url.endsWith('/status')) return Response.json({ ready: true, number: sender })
    assert.equal(url, bridge.url + '/send'); t.state.posts++
    const payload = JSON.parse(init.body)
    assert.deepEqual(payload.sequence, contract)
    if (scenario === 'proxy') return Response.json({ error: 'Not connected' }, { status: 503 })
    if (scenario === 'bad_json') return new Response('{broken')
    if (scenario === 'lost_rejection') { await t.invoke(payload); throw Error('SYNTHETIC lost response') }
    if (scenario === 'timeout') {
      t.state.pending = t.invoke(payload)
      while (!t.state.release) await Promise.resolve()
      throw Error('SYNTHETIC client timeout')
    }
    if (['wrong_op', 'wrong_sender', 'false_id', 'old_contract', 'null_id_response'].includes(scenario)) {
      return Response.json({ success: scenario !== 'false_id', id: scenario === 'null_id_response' ? null : 'synthetic-current', ...(scenario === 'old_contract' ? {} : { sequence: { ...contract, outcome: 'confirmed', ...(scenario === 'wrong_op' ? { operation_id: '00000000-0000-4000-8000-000000000099' } : {}), ...(scenario === 'wrong_sender' ? { sender: '15555550999' } : {}) } }) })
    }
    return t.invoke(payload)
  }
  const globals = { fetch: request, AbortSignal: { timeout: ms => ({ syntheticTimeout: ms }) } }
  const batch = load('src/lib/sequence-batch.ts', {}, globals)
  const models = load('src/lib/ai-sequence-models.ts')
  const config = load('src/lib/ai-sequence-config.ts', { './ai-sequence-models': models })
  const cfg = { ...config.defaultAIConfig, timezone: 'UTC', days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' }
  const db = {
    rpc: async (name, args) => {
      calls.push({ name, args })
      if (name.startsWith('claim_')) return { data: [enrollment] }
      if (name === 'begin_sequence_batch') return { data: { allowed: true } }
      if (name === 'reject_sequence_batch' && options.rejectLost) return { data: null, error: { code: 'SYNTHETIC_LOST_RPC' } }
      if (name === 'reject_sequence_batch' && options.rejectFalse) return { data: false }
      if (name === 'finish_sequence_batch' && options.finishLost) return { data: null, error: { code: 'SYNTHETIC_LOST_RPC' } }
      return { data: true }
    },
    from: table => {
      const records = { sequences: { ai_config: cfg }, sequence_steps: [{ step_order: 0, step_type: 'send_template', custom_body: body.message }], leads: { phone: body.number, lead_language: 'pt' }, buyers: { name: 'SYNTHETIC', is_active: true } }
      const q = { select() { return this }, eq() { return this }, single: async () => ({ data: records[table] }), order: async () => ({ data: records[table] }), insert: async () => { calls.push({ name: 'follow_ups' }); return {} } }; return q
    },
  }
  let result, thrown
  if (mode === 'ai') {
    const engine = load('src/lib/ai-sequence-engine.ts', { './sequence-batch': batch, './ai-sequence-config': config, './ai-sequence-copy': { generateSequenceCopy: async () => ({ body: body.message, choice: 'synthetic' }), generationStopReason: () => 'AI_INTERNAL_ERROR' }, './wa-bridge': { getBridgeForBuyer: async () => bridge }, './send-guard': { checkSendRate: async () => ({ ok: true }) } }, globals)
    const ports = engine.aiEnginePorts(db); ports.now = () => new Date('2026-10-07T16:00:00Z')
    result = await engine.runAIEnrollment(enrollment.id, ports)
  } else {
    const unused = () => { throw Error('Unused synthetic IO') }
    const engine = load('src/lib/sequence-engine.ts', { './sequence-batch': batch, '@/lib/supabase/admin': { createAdminClient: unused }, '@/lib/template-render': { renderTemplate: s => s }, '@/lib/wa-bridge': { getBridgeForBuyer: async () => bridge }, '@/lib/send-guard': { checkSendRate: async () => ({ ok: true }) }, resend: { Resend: unused }, '@/lib/buyer-locale': { localeDoBuyer: unused, trad: unused }, '@/lib/lead-message-template': { localizeLeadTemplate: async (_db, tpl) => tpl }, '@/lib/lead-message-locale': { requireLeadMessageLocale: () => 'pt' } }, globals)
    try { result = await engine.runLegacyEnrollment(enrollment.id, db) } catch (error) { thrown = error }
  }
  return { ...t, calls, result, thrown }
}
for (const mode of ['ai', 'legacy']) {
  for (const scenario of ['pre_503', 'pre_404']) test(`${mode} ${scenario}: settles rejection, never finishes/defer/retries`, async () => {
    const r = await runEngine(mode, scenario)
    assert.equal(r.state.posts, 1); assert.equal(r.state.sends, 0); assert.equal(r.result, false)
    const rejection = r.calls.find(c => c.name === 'reject_sequence_batch')
    assert.ok(rejection)
    assert.equal(rejection.args.p_token, operation); assert.equal(rejection.args.p_sender, sender)
    assert.equal(rejection.args.p_cycle, '2026-10-07T12:00:00.000Z'); assert.equal(rejection.args.p_step, 0)
    assert.equal(rejection.args.p_proof.outcome, 'rejected_before_send')
    assert.ok(!r.calls.some(c => ['finish_sequence_batch', 'defer_sequence_batch', 'follow_ups'].includes(c.name)))
  })
  test(`${mode}: only correlated success and current receipt finishes`, async () => {
    const r = await runEngine(mode, 'confirmed')
    assert.equal(r.result, true); assert.equal(r.state.posts, 1); assert.equal(r.state.sends, 1)
    assert.equal(r.calls.find(c => c.name === 'finish_sequence_batch').args.p_wa, 'synthetic-current')
  })
  for (const scenario of ['proxy', 'bad_json', 'wrong_op', 'wrong_sender', 'false_id', 'old_contract', 'null_id_response', 'noack', 'old_ack', 'throw', 'timeout', 'lost_rejection']) test(`${mode}: ${scenario} remains unknown without replay`, async () => {
    const r = await runEngine(mode, scenario)
    assert.equal(r.state.posts, 1)
    assert.equal(r.calls.find(c => c.name === 'defer_sequence_batch')?.args.p_unknown, true)
    assert.ok(!r.calls.some(c => ['reject_sequence_batch', 'finish_sequence_batch'].includes(c.name)))
    if (scenario === 'timeout') { r.state.release(); await r.state.pending; assert.equal(r.state.sends, 1) }
  })
  for (const options of [{ rejectLost: true }, { rejectFalse: true }]) test(`${mode}: unpersisted rejection remains unknown ${JSON.stringify(options)}`, async () => {
    const r = await runEngine(mode, 'pre_503', options)
    assert.ok(r.calls.some(c => c.name === 'reject_sequence_batch'))
    assert.equal(r.calls.find(c => c.name === 'defer_sequence_batch')?.args.p_unknown, true)
    assert.equal(r.state.posts, 1); assert.equal(r.state.sends, 0)
  })
  test(`${mode}: lost finish response never replays transport`, async () => {
    const r = await runEngine(mode, 'confirmed', { finishLost: true })
    assert.equal(r.calls.find(c => c.name === 'defer_sequence_batch')?.args.p_unknown, true)
    assert.equal(r.state.posts, 1); assert.equal(r.state.sends, 1)
  })
}
