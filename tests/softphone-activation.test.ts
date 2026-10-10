import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDeviceActivator } from '../src/components/voice/softphone-activation'

type Gate = { promise: Promise<void>; release: () => void }
function gate(): Gate {
  let release!: () => void
  const promise = new Promise<void>(r => { release = r })
  return { promise, release }
}

function okToken(identity = 'buyer-1') {
  return async () => ({ ok: true, status: 200, json: async () => ({ token: 'fixture-token', identity }) })
}

class FakeDevice {
  static created = 0
  registered = false
  registerGate?: Gate
  constructor(public token: string) { FakeDevice.created++ }
  async register() { if (this.registerGate) await this.registerGate.promise; this.registered = true }
  destroy() {}
}

test('clicar durante a ativação pendente espera a ativação terminar em vez de falhar', async () => {
  FakeDevice.created = 0
  const g = gate()
  const activator = createDeviceActivator({
    fetchToken: okToken(),
    createDevice: async token => { const d = new FakeDevice(token); d.registerGate = g; return d },
    isMounted: () => true,
    log: () => {},
  })

  const first = activator.ensure()           // load da página
  await new Promise(r => setTimeout(r, 0))   // deixa a ativação chegar ao register()
  const second = activator.ensure()          // clique em Ligar enquanto ainda ativa
  g.release()

  const [a, b] = await Promise.all([first, second])
  assert.equal(a.ok, true)
  assert.equal(b.ok, true, 'clique durante ativação pendente não pode virar falha')
  assert.equal(FakeDevice.created, 1, 'um único Device para as duas chamadas')
  assert.equal(activator.current(), (a as any).device)
})

test('sessão recusada pelo servidor vira motivo legível e permite nova tentativa', async () => {
  FakeDevice.created = 0
  let status = 401
  const activator = createDeviceActivator({
    fetchToken: async () => ({ ok: status === 200, status, json: async () => (status === 200 ? { token: 't', identity: 'b' } : { error: 'Unauthorized' }) }),
    createDevice: async token => new FakeDevice(token),
    isMounted: () => true,
    log: () => {},
  })

  const denied = await activator.ensure()
  assert.equal(denied.ok, false)
  assert.equal((denied as any).reason, 'unauthorized')
  assert.equal(activator.current(), null)

  status = 200
  const retry = await activator.ensure()
  assert.equal(retry.ok, true, 'depois da falha o próximo clique tenta de novo')
  assert.equal(FakeDevice.created, 1)
})

test('falha ao registrar o telefone não trava as tentativas seguintes', async () => {
  FakeDevice.created = 0
  let fail = true
  const activator = createDeviceActivator({
    fetchToken: okToken(),
    createDevice: async token => {
      const d = new FakeDevice(token)
      if (fail) d.register = async () => { throw new Error('register boom') }
      return d
    },
    isMounted: () => true,
    log: () => {},
  })

  const first = await activator.ensure()
  assert.equal(first.ok, false)
  assert.equal((first as any).reason, 'register')
  assert.equal(activator.current(), null)

  fail = false
  const second = await activator.ensure()
  assert.equal(second.ok, true)
  assert.equal(FakeDevice.created, 2)
})

test('componente desmontado durante a ativação não guarda Device', async () => {
  FakeDevice.created = 0
  let mounted = true
  const activator = createDeviceActivator({
    fetchToken: async () => { mounted = false; return { ok: true, status: 200, json: async () => ({ token: 't', identity: 'b' }) } },
    createDevice: async token => new FakeDevice(token),
    isMounted: () => mounted,
    log: () => {},
  })
  const r = await activator.ensure()
  assert.equal(r.ok, false)
  assert.equal((r as any).reason, 'unmounted')
  assert.equal(activator.current(), null)
})
