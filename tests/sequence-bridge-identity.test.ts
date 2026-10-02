import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { SequenceWaiting, verifiedSequenceBridge } from '../src/lib/sequence-batch'

const bridge = { url: 'https://bridge.invalid', key: 'fixture', ownerBuyerId: 'fixture-owner', phone: '+1 (555) 555-0100' }

// Execute the actual /status route registration, not an invented response mock.
// Only Express/client runtime dependencies are synthetic; no bridge is contacted.
function serverStatus(ready = true, number: string | null = '15555550100') {
  const source = readFileSync(new URL('../infra/vps/wa-bridge-server.js', import.meta.url), 'utf8')
  const registrations = source.split('\n').filter(line => line.startsWith('app.get("/status",'))
  assert.equal(registrations.length, 1, 'review the real server contract if its route changes')
  let payload: unknown
  runInNewContext(registrations[0], {
    app: { get: (path: string, handler: (req: object, res: object) => void) => {
      assert.equal(path, '/status')
      handler({}, { json: (value: unknown) => { payload = value } })
    } },
    isReady: ready, currentQR: null, client: { info: { wid: { user: number } } }, INSTANCE_NAME: 'local-fixture',
  })
  return JSON.parse(JSON.stringify(payload))
}

test('real server status number authenticates and canonicalizes the configured sender', async () => {
  const status = serverStatus()
  assert.equal(status.number, '15555550100')
  assert.equal(Object.hasOwn(status, 'phone'), false)
  const result = await verifiedSequenceBridge(bridge, async (url, init) => {
    assert.equal(url, 'https://bridge.invalid/status')
    assert.equal(new Headers(init?.headers).get('apikey'), 'fixture')
    assert.ok(init?.signal)
    return Response.json(status)
  })
  assert.deepEqual(result, { ...bridge, phone: '15555550100' })
})

test('phone-only compatibility is explicit; a present number or phone must never be ignored', async () => {
  for (const status of [
    { ready: true, phone: '15555550100' },
    { ready: true, number: '15555550100', phone: '+1 (555) 555-0100' },
  ]) assert.equal((await verifiedSequenceBridge(bridge, async () => Response.json(status))).phone, '15555550100')
  const invalid: unknown[] = [null, '', false, 15555550100, [], {}, '123', '01555550100', '15555550100@c.us', '15555550100x', '15555550100\n', '15555550100\r', '\t15555550100', '+1555555010012345']
  for (const value of invalid) {
    await assert.rejects(verifiedSequenceBridge(bridge, async () => Response.json({ ready: true, number: value, phone: '15555550100' })), SequenceWaiting)
    await assert.rejects(verifiedSequenceBridge(bridge, async () => Response.json({ ready: true, number: '15555550100', phone: value })), SequenceWaiting)
  }
  for (const status of [
    { ready: true, number: '15555550200', phone: '15555550100' },
    { ready: true, number: '15555550100', phone: '15555550200' },
    { ready: true, number: '15555550200' },
    { ready: 'true', number: '15555550100' },
    null, [], { ready: true },
  ]) await assert.rejects(verifiedSequenceBridge(bridge, async () => Response.json(status)), SequenceWaiting)
  for (const phone of [null, '', 'bad', '15555550200']) {
    await assert.rejects(verifiedSequenceBridge({ ...bridge, phone }, async () => Response.json(serverStatus())), SequenceWaiting)
  }
  let requests = 0
  await assert.rejects(verifiedSequenceBridge(null, async () => { requests++; return Response.json(serverStatus()) }), SequenceWaiting)
  assert.equal(requests, 0, 'no global fallback')
  assert.equal((await verifiedSequenceBridge({ ...bridge, phone: undefined }, async () => Response.json(serverStatus()))).phone, '15555550100')
})

test('real server not ready or missing session identity fails closed', async () => {
  for (const status of [serverStatus(false), serverStatus(true, null)]) {
    await assert.rejects(verifiedSequenceBridge(bridge, async () => Response.json(status)), SequenceWaiting)
  }
})
