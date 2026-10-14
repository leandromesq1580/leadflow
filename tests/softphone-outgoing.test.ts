import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDeviceActivator } from '../src/components/voice/softphone-activation'

test('ligação de saída não depende do registro de recebimento recusado pelo Twilio', async () => {
  let registrations = 0
  let connections = 0
  const device = {
    register: async () => { registrations++; throw new Error('recebimento indisponível (fixture)') },
    connect: async () => { connections++; return { fixture: true } },
    destroy: () => {},
    updateToken: (_token: string) => {},
  }
  const activator = createDeviceActivator({
    fetchToken: async () => ({ ok: true, status: 200, json: async () => ({ token: 'synthetic-token', identity: 'synthetic_buyer' }) }),
    createDevice: async () => device,
    isMounted: () => true,
    log: () => {},
  })
  const result = await activator.ensure()
  assert.equal(result.ok, true, 'preparação de saída não deve ser bloqueada por register() de recebimento')
  if (result.ok) await result.device.connect()
  assert.equal(registrations, 0, 'nenhum registro de recebimento necessário para saída')
  assert.equal(connections, 1, 'o fluxo deve chegar ao transporte de saída simulado')
})
