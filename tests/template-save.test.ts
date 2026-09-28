import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Execute the actual page handler, replacing only network and React setters.
// No network, credentials or database writes are used by this regression suite.
const source = readFileSync(new URL('../src/app/dashboard/templates/page.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let handler = ''
const initialHandlers: string[] = []
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'save') handler = node.getText(ast)
  if (ts.isFunctionDeclaration(node) && ['fetchBuyer', 'load'].includes(node.name?.text || '')) {
    initialHandlers.push(node.getText(ast))
  }
  ts.forEachChild(node, visit)
}
visit(ast)
assert.ok(handler, 'real page save handler must exist')
const javascript = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

async function exercise(editing: { id: string; is_system: boolean } | null, response: 'ok' | 'http-error' | 'network-error' = 'ok', reloadFails = false) {
  const requests: { url: string; method: string; body: Record<string, unknown> }[] = []
  const state = { editing, showNew: true, saving: false, error: '', reloads: 0 }
  const data = { name: 'Whatsapp Follow-up', type: 'whatsapp', subject: null, body: 'Oi {primeiro_nome}! Aqui é {agente}.' }
  const context = {
    data, editing, buyerId: 'buyer-fixture', saving: false,
    L: (pt: string) => pt,
    fetch: async (url: string, options: { method: string; body: string }) => {
      requests.push({ url, method: options.method, body: JSON.parse(options.body) })
      if (response === 'network-error') throw new Error('synthetic offline')
      return { ok: response === 'ok', status: response === 'ok' ? 200 : 405 }
    },
    setSaving: (v: boolean) => { state.saving = v },
    setEditing: (v: typeof editing) => { state.editing = v },
    setShowNew: (v: boolean) => { state.showNew = v },
    setSaveError: (v: string) => { state.error = v },
    load: async () => { state.reloads++; if (reloadFails) throw new Error('synthetic reload failure') },
  }
  await runInNewContext(`${javascript}\nsave(data)`, context)
  return { requests, state, data }
}

assert.equal(initialHandlers.length, 2, 'real fetchBuyer and load handlers must exist')
const initialJavascript = ts.transpileModule(initialHandlers.join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

type LoadFailure = 'http-error' | 'network-error' | 'json-error' | 'ok'
function initialHarness(failure: LoadFailure, endpoint: 'settings' | 'templates' = 'templates') {
  const requests: string[] = []
  const state = { buyerId: '', loading: true, error: '', templates: [] as unknown[], saving: false, showNew: true }
  const context = {
    L: (pt: string) => pt,
    editing: null, buyerId: 'buyer-fixture', data: { name: 'Draft', body: 'Hello' },
    fetch: async (url: string, options?: { method: string }) => {
      requests.push(url)
      if (options?.method === 'POST') return { ok: true }
      const fails = url.startsWith(`/api/${endpoint}?`)
      if (fails && failure === 'network-error') throw new Error('synthetic offline')
      return {
        ok: !(fails && failure === 'http-error'),
        status: fails && failure === 'http-error' ? 500 : 200,
        json: async () => {
          if (fails && failure === 'json-error') throw new SyntaxError('synthetic invalid JSON')
          return url.startsWith('/api/settings?') ? { id: 'buyer-fixture' } : { templates: [{ id: 'template-fixture' }] }
        },
      }
    },
    setBuyerId: (v: string) => { state.buyerId = v },
    setLoading: (v: boolean) => { state.loading = v },
    setTemplates: (v: unknown[]) => { state.templates = v },
    setSaveError: (v: string) => { state.error = v },
    setSaving: (v: boolean) => { state.saving = v },
    setEditing: () => {},
    setShowNew: (v: boolean) => { state.showNew = v },
  }
  const handlers = runInNewContext(`${initialJavascript}\n${javascript}\n({ fetchBuyer, load, save })`, context)
  return { state, requests, handlers, data: context.data }
}

test('initial template HTTP failure is caught, displayed and ends loading', async () => {
  const { handlers, state, requests } = initialHarness('http-error')
  await assert.doesNotReject(() => handlers.fetchBuyer('auth-fixture'))
  // Let a detached load rejection surface under node:test as well as checking UI state.
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(requests, ['/api/settings?auth_user_id=auth-fixture', '/api/templates?buyer_id=buyer-fixture'])
  assert.equal(state.loading, false)
  assert.match(state.error, /Não foi possível carregar os modelos/)
  assert.doesNotMatch(state.error, /Modelo salvo|Não foi possível salvar/)
  assert.match(source, /saveError && <p role="alert"[^>]*>\{saveError\}<\/p>/)
})

for (const endpoint of ['settings', 'templates'] as const) {
  for (const failure of ['http-error', 'network-error', 'json-error'] as const) {
    if (endpoint === 'templates' && failure === 'http-error') continue // Covered by the original regression above.
    test(`initial ${endpoint} ${failure} is caught and ends loading with a load error`, async () => {
      const { handlers, state, requests } = initialHarness(failure, endpoint)
      await assert.doesNotReject(() => handlers.fetchBuyer('auth-fixture'))
      await new Promise(resolve => setImmediate(resolve))
      assert.equal(state.loading, false)
      assert.match(state.error, /Não foi possível carregar os modelos/)
      assert.doesNotMatch(state.error, /Modelo salvo|Não foi possível salvar/)
      assert.deepEqual(state.templates, [])
      if (endpoint === 'settings') {
        assert.equal(state.buyerId, '')
        assert.deepEqual(requests, ['/api/settings?auth_user_id=auth-fixture'])
      }
    })
  }
}

test('initial successful load populates templates without an error', async () => {
  const { handlers, state } = initialHarness('ok')
  await handlers.fetchBuyer('auth-fixture')
  assert.equal(state.buyerId, 'buyer-fixture')
  assert.deepEqual(state.templates, [{ id: 'template-fixture' }])
  assert.equal(state.loading, false)
  assert.equal(state.error, '')
})

for (const failure of ['http-error', 'network-error', 'json-error'] as const) {
  test(`real load still propagates ${failure} to its caller and ends loading`, async () => {
    const { handlers, state } = initialHarness(failure)
    await assert.rejects(() => handlers.load('buyer-fixture'), /Template list unavailable|synthetic/)
    assert.equal(state.loading, false)
    assert.equal(state.error, '')
  })

  test(`real save and load preserve the saved-but-refresh-failed message for ${failure}`, async () => {
    const { handlers, state, data, requests } = initialHarness(failure)
    await assert.doesNotReject(() => handlers.save(data))
    assert.deepEqual(requests, ['/api/templates', '/api/templates?buyer_id=buyer-fixture'])
    assert.equal(state.loading, false)
    assert.equal(state.saving, false)
    assert.equal(state.showNew, false)
    assert.match(state.error, /Modelo salvo/)
    assert.doesNotMatch(state.error, /Não foi possível carregar os modelos|Não foi possível salvar/)
  })
}

test('successful save followed by reload failure does not falsely report a failed save', async () => {
  const { state, requests } = await exercise({ id: '', is_system: false }, 'ok', true)
  assert.equal(state.editing, null)
  assert.equal(state.saving, false)
  assert.equal(requests.length, 1)
  assert.match(state.error, /Modelo salvo/)
  assert.doesNotMatch(state.error, /Não foi possível salvar/)
})

test('network failure keeps the draft and allows retry without an unhandled rejection', async () => {
  const editing = { id: 'existing-template', is_system: false }
  const { state } = await exercise(editing, 'network-error')
  assert.equal(state.editing, editing)
  assert.equal(state.showNew, true)
  assert.equal(state.saving, false)
  assert.equal(state.reloads, 0)
  assert.match(state.error, /salvar/i)
})

test('editing a saved template uses PATCH with its ID and preserves the submitted text', async () => {
  const { requests, data, state } = await exercise({ id: 'existing-template', is_system: false })
  assert.equal(requests[0].method, 'PATCH')
  assert.equal(requests[0].url, '/api/templates/existing-template')
  assert.deepEqual(requests[0].body, data)
  assert.equal(state.editing, null)
  assert.equal(state.saving, false)
})

test('new template uses POST with buyer identity', async () => {
  const { requests } = await exercise(null)
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].body.buyer_id, 'buyer-fixture')
})

test('system original is never updated even if its ID is present', async () => {
  const { requests } = await exercise({ id: 'system-template', is_system: true })
  assert.equal(requests[0].method, 'POST')
})

test('HTTP error keeps the draft open, reports failure and resets saving', async () => {
  const editing = { id: '', is_system: false }
  const { state } = await exercise(editing, 'http-error')
  assert.equal(state.editing, editing)
  assert.equal(state.showNew, true)
  assert.equal(state.reloads, 0)
  assert.equal(state.saving, false)
  assert.match(state.error, /salvar/i)
})

test('duplicated system template is created with POST, never PATCH with an empty ID', async () => {
  const { requests, state, data } = await exercise({ id: '', is_system: false })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].url, '/api/templates')
  assert.deepEqual(requests[0].body, { ...data, buyer_id: 'buyer-fixture' })
  assert.equal(state.editing, null)
  assert.equal(state.reloads, 1)
})
