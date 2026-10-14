import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

// Componente real; somente React/browser/transporte são fixtures. Nenhuma rede ou chamada.
function harness(options: { connectError?: object; deviceAuthError?: boolean; locale?: string } = {}) {
  const listeners = new Map<string, (ev: unknown) => Promise<void>>()
  const alerts: string[] = []
  const logs: unknown[] = []
  const devices: FakeDevice[] = []
  const calls: EventEmitter[] = []
  const effects: (() => void | (() => void))[] = []
  let fetches = 0, registrations = 0, connections = 0
  let failure = options.connectError
  class FakeDevice extends EventEmitter {
    destroyed = false
    constructor(public token: string) { super(); devices.push(this) }
    async register() { registrations++; throw new Error('recebimento recusado (fixture)') }
    async connect() {
      connections++
      if (options.deviceAuthError && failure) { this.emit('error', failure); throw undefined }
      if (failure) throw failure
      const call = new EventEmitter(); calls.push(call); return call
    }
    destroy() { this.destroyed = true }
    updateToken(token: string) { this.token = token }
  }
  const cache = new Map<string, unknown>()
  function load(file: string): Record<string, unknown> {
    if (cache.has(file)) return cache.get(file) as Record<string, unknown>
    const source = process.env.SOFTPHONE_BASE_SHA
      ? execFileSync('git', ['show', `${process.env.SOFTPHONE_BASE_SHA}:${file}`], { encoding: 'utf8' })
      : readFileSync(resolve(file), 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const evaluatedModule = { exports: {} }
    const context = {
      module: evaluatedModule, exports: evaluatedModule.exports,
      require: (id: string) => {
        if (id === 'react') return { useRef: (value: unknown) => ({ current: value }), useState: (value: unknown) => [value, () => {}], useEffect: (fn: () => void) => { effects.push(fn) } }
        if (id === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
        if (id === '@twilio/voice-sdk') return { Device: FakeDevice }
        if (id === '@/lib/i18n-client') return { useT: () => ({ _locale: options.locale || 'pt' }) }
        if (id === './call-script-panel') return { CallScriptPanel: () => null }
        if (id.startsWith('./softphone-')) return load(`src/components/voice/${id.slice(2)}.ts`)
        throw new Error(`import não permitido: ${id}`)
      },
      fetch: async (url: string) => {
        assert.equal(url, '/api/voice/token', 'nenhuma escrita ou destino externo permitido')
        fetches++
        return { ok: true, status: 200, json: async () => ({ token: `synthetic-token-${fetches}`, identity: 'synthetic_buyer' }) }
      },
      window: { addEventListener: (name: string, fn: (ev: unknown) => Promise<void>) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name), dispatchEvent: () => {} },
      alert: (message: string) => alerts.push(message),
      console: { warn: (...args: unknown[]) => logs.push(args) },
      setTimeout: () => 1, clearInterval: () => {}, setInterval: () => 1,
    }
    vm.runInNewContext(compiled, context, { filename: file })
    cache.set(file, evaluatedModule.exports)
    return evaluatedModule.exports
  }
  const Softphone = load('src/components/voice/softphone.tsx').Softphone as () => void
  Softphone()
  const cleanup = effects[0]()
  return {
    alerts, logs, devices, calls,
    fail: (error?: object) => { failure = error },
    idle: async () => { await new Promise(resolve => setImmediate(resolve)) },
    click: async () => { await listeners.get('l4p:call')!({ detail: { phone: '+15555550100', name: 'Fixture' } }) },
    counters: () => ({ fetches, registrations, connections }),
    cleanup: () => { if (typeof cleanup === 'function') cleanup() },
  }
}

test('aba ociosa busca autorização nova antes de ligar sem depender de tokenWillExpire', async () => {
  const h = harness()
  try {
    await h.idle()
    assert.equal(h.counters().fetches, 1)
    await h.click()
    assert.equal(h.counters().fetches, 2, 'o primeiro clique após ociosidade precisa de autorização atual')
    assert.equal(h.devices[0].token, 'synthetic-token-2')
    assert.equal(h.counters().connections, 1)
    assert.equal(h.counters().registrations, 0)
  } finally { h.cleanup() }
})

test('Device.error de autorização seguido de close sem código não prende a aba ao token recusado', async () => {
  const h = harness({ connectError: { code: 20104, message: 'synthetic-token-sensitive' }, deviceAuthError: true })
  try {
    await h.click()
    assert.match(h.alerts[0], /Twilio recusou a autorização.*20104/)
    assert.equal(h.devices[0].destroyed, true)
    assert.equal(h.counters().connections, 1)
    h.fail()
    await h.click()
    assert.equal(h.counters().fetches, 2)
    assert.equal(h.counters().connections, 2)
    assert.equal(h.alerts.length, 1)
    assert.doesNotMatch(JSON.stringify(h.logs), /synthetic-token-sensitive/)
  } finally { h.cleanup() }
})

test('erro posterior da chamada também mostra motivo sem expor mensagem do SDK', async () => {
  const h = harness()
  try {
    await h.click()
    h.calls[0].emit('error', { code: 53000, message: 'synthetic-token-sensitive' })
    assert.match(h.alerts[0], /conexão.*53000/)
    assert.doesNotMatch(h.alerts[0], /microfone|synthetic-token-sensitive/)
    assert.equal(h.counters().connections, 1, 'não existe rediscagem automática')
  } finally { h.cleanup() }
})

test('componente chega à saída sem registrar recebimento e sem alerta falso', async () => {
  const h = harness()
  try {
    await h.click()
    assert.equal(h.counters().registrations, 0)
    assert.equal(h.counters().connections, 1)
    assert.equal(h.counters().fetches, 1)
    assert.deepEqual(h.alerts, [])
  } finally { h.cleanup() }
})

test('autorização recusada é visível e próximo clique busca outro token sem rediscagem automática', async () => {
  const h = harness({ connectError: { code: 20101, message: 'synthetic-token-sensitive' } })
  try {
    await h.click()
    assert.equal(h.counters().connections, 1)
    assert.match(h.alerts[0], /Twilio recusou a autorização.*20101/)
    assert.doesNotMatch(h.alerts[0], /microfone|synthetic-token-sensitive/)
    assert.equal(h.devices[0].destroyed, true)
    h.fail()
    await h.click()
    assert.equal(h.counters().fetches, 2)
    assert.equal(h.counters().connections, 2)
    assert.equal(h.alerts.length, 1)
    assert.doesNotMatch(JSON.stringify(h.logs), /synthetic-token-sensitive/)
  } finally { h.cleanup() }
})

for (const locale of ['pt', 'en', 'es']) {
  test(`recusa real de microfone aparece somente após tentativa de saída (${locale})`, async () => {
    const h = harness({ locale, connectError: { code: 31401 } })
    try {
      await h.click()
      assert.equal(h.counters().connections, 1)
      assert.match(h.alerts[0], /31401/)
      assert.match(h.alerts[0], /microfone|microphone|micrófono/)
    } finally { h.cleanup() }
  })
}
