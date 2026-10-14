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
  updateToken(token: string) { this.token = token }
}

test('clicar durante a ativação pendente espera a ativação terminar em vez de falhar', async () => {
  FakeDevice.created = 0
  const g = gate()
  const activator = createDeviceActivator({
    fetchToken: okToken(),
    createDevice: async token => { const d = new FakeDevice(token); await g.promise; return d },
    isMounted: () => true,
    log: () => {},
  })

  const first = activator.ensure()           // load da página
  await new Promise(r => setTimeout(r, 0))   // deixa a ativação chegar à criação do Device
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

test('falha ao criar o telefone não trava as tentativas seguintes', async () => {
  FakeDevice.created = 0
  let fail = true
  const activator = createDeviceActivator({
    fetchToken: okToken(),
    createDevice: async token => {
      if (fail) throw new Error('sdk indisponível (fixture)')
      const d = new FakeDevice(token)
      return d
    },
    isMounted: () => true,
    log: () => {},
  })

  const first = await activator.ensure()
  assert.equal(first.ok, false)
  assert.equal((first as any).reason, 'sdk')
  assert.equal(activator.current(), null)

  fail = false
  const second = await activator.ensure()
  assert.equal(second.ok, true)
  assert.equal(FakeDevice.created, 1)
})

test('renovação no clique compartilha uma requisição e preserva a instância', async () => {
  const g = gate()
  let fetches = 0
  const activator = createDeviceActivator({
    fetchToken: async () => {
      fetches++
      if (fetches === 2) await g.promise
      return { ok: true, status: 200, json: async () => ({ token: `synthetic-${fetches}` }) }
    },
    createDevice: async token => new FakeDevice(token),
    isMounted: () => true,
    log: () => {},
  })
  const first = await activator.ensure()
  assert.equal(first.ok, true)
  const a = activator.ensure({ refresh: true })
  const b = activator.ensure({ refresh: true })
  assert.equal(a, b)
  g.release()
  const [ra, rb] = await Promise.all([a, b])
  assert.equal(fetches, 2)
  assert.equal(ra.ok, true)
  assert.equal(rb.ok, true)
  assert.equal(activator.current()?.token, 'synthetic-2')
  if (first.ok && ra.ok) assert.equal(first.device, ra.device)
})

test('falha de renovação impede saída e permite obter autorização nova depois', async () => {
  let status = 200
  let fetches = 0
  const activator = createDeviceActivator({
    fetchToken: async () => { fetches++; return { ok: status === 200, status, json: async () => ({ token: `synthetic-${fetches}` }) } },
    createDevice: async token => new FakeDevice(token),
    isMounted: () => true,
    log: () => {},
  })
  assert.equal((await activator.ensure()).ok, true)
  status = 401
  const denied = await activator.ensure({ refresh: true })
  assert.deepEqual(denied, { ok: false, reason: 'unauthorized', detail: 'HTTP 401' })
  status = 200
  assert.equal((await activator.ensure({ refresh: true })).ok, true)
  assert.equal(fetches, 3)
  assert.equal(activator.current()?.token, 'synthetic-3')
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
