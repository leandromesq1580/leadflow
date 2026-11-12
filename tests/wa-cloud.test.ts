import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cloudAutomationEnabled,
  getWhatsAppCloudConfig,
  isCompanyWhatsAppSender,
  normalizeCloudRecipient,
  sendCloudTemplate,
  sendCloudText,
  verifyCompanyCloudPhone,
} from '../src/lib/wa-cloud'

const env = {
  WA_CLOUD_AUTOMATION_ENABLED: 'true',
  WA_CLOUD_PHONE_NUMBER_ID: '123',
  WA_CLOUD_WABA_ID: '456',
  WA_CLOUD_GRAPH_VERSION: 'v25.0',
  WA_CLOUD_ACCESS_TOKEN: 'fixture-access',
  WA_CLOUD_APP_SECRET: 'fixture-app',
  WA_CLOUD_VERIFY_TOKEN: 'fixture-verify',
}
const config = getWhatsAppCloudConfig(env)!
const template = { to: '(305) 555-0100', name: 'follow_up', language: 'pt_BR', operationId: 'test-operation' }

test('Cloud automation is opt-in and requires complete Graph and webhook configuration', () => {
  assert.equal(cloudAutomationEnabled({}), false)
  assert.equal(cloudAutomationEnabled({ WA_CLOUD_AUTOMATION_ENABLED: '1' }), false)
  assert.equal(cloudAutomationEnabled(env), true)
  assert.deepEqual(config, {
    phoneNumberId: '123', wabaId: '456', graphVersion: 'v25.0',
    accessToken: 'fixture-access', appSecret: 'fixture-app', verifyToken: 'fixture-verify',
  })
  for (const key of Object.keys(env).filter(key => key !== 'WA_CLOUD_AUTOMATION_ENABLED')) {
    assert.equal(getWhatsAppCloudConfig({ ...env, [key]: ' ' }), null, key)
  }
  assert.equal(getWhatsAppCloudConfig({ ...env, WA_CLOUD_PHONE_NUMBER_ID: '123/messages' }), null)
  assert.equal(getWhatsAppCloudConfig({ ...env, WA_CLOUD_WABA_ID: '12abc' }), null)
  assert.equal(getWhatsAppCloudConfig({ ...env, WA_CLOUD_GRAPH_VERSION: '25.0' }), null)
})

test('Cloud recipients preserve explicit country codes and reject bridge addresses', () => {
  assert.equal(normalizeCloudRecipient('(305) 555-0100'), '13055550100')
  assert.equal(normalizeCloudRecipient('+1(305)555-0100'), '13055550100')
  assert.equal(normalizeCloudRecipient('+55 (11) 98765-4321'), '5511987654321')
  assert.equal(normalizeCloudRecipient('+47 400 00 000'), '4740000000')
  for (const bad of ['0123456789', '12345', '+1 305 555 010', '1 (305 555-0100', '3055550100@c.us', '12036340000@g.us', '3055550100 ext 2']) {
    assert.equal(normalizeCloudRecipient(bad), null, bad)
  }
})

test('legacy company sender is recognized by number or configured bridge identity', () => {
  const bridgeEnv = { WA_CLOUD_LEGACY_BRIDGE_URL: 'https://wa.example.test/company/' }
  assert.equal(isCompanyWhatsAppSender({ phone: '(786) 744-2126' }, bridgeEnv), true)
  assert.equal(isCompanyWhatsAppSender({ url: 'http://62.146.229.13:3456/' }, bridgeEnv), true)
  assert.equal(isCompanyWhatsAppSender({ phone: '+1 305 555 0100', url: 'http://62.146.229.13:3457' }, bridgeEnv), true)
  assert.equal(isCompanyWhatsAppSender({ url: 'https://wa.example.test/company' }, bridgeEnv), true)
  assert.equal(isCompanyWhatsAppSender({ url: 'https://wa.example.test/company-extra' }, bridgeEnv), false)
  assert.equal(isCompanyWhatsAppSender({ url: 'http://62.146.229.13.example.test:3457' }, bridgeEnv), false)
  assert.equal(isCompanyWhatsAppSender({ phone: '3055550100', url: 'http://62.146.229.13:3458' }, bridgeEnv), false)
})

test('the configured Graph phone ID must belong to the company number', async () => {
  let requests = 0
  const request: typeof fetch = async (url, init) => {
    requests++
    assert.equal(url, 'https://graph.facebook.com/v25.0/123?fields=display_phone_number')
    assert.equal(init?.method, 'GET')
    assert.equal(init?.cache, 'no-store')
    assert.equal(init?.redirect, 'error')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-access')
    return Response.json({ id: '123', display_phone_number: '+1 786-744-2126' })
  }
  assert.equal(await verifyCompanyCloudPhone(config, request), true)
  assert.equal(requests, 1)
  assert.equal(await verifyCompanyCloudPhone(config, async () => Response.json({ id: '123', display_phone_number: '+1 305-555-0100' })), false)
  assert.equal(await verifyCompanyCloudPhone(config, async () => Response.json({ id: '456', display_phone_number: '+1 786-744-2126' })), false)
  assert.equal(await verifyCompanyCloudPhone(config, async () => new Response('', { status: 500 })), false)
})

test('Cloud submits one static template or text with its callback correlation ID', async () => {
  const requests: { url: string; init: RequestInit | undefined }[] = []
  const request: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init })
    return Response.json({ messages: [{ id: 'wamid.fixture' }] })
  }

  assert.deepEqual(await sendCloudTemplate(config, template, request), { kind: 'accepted', messageId: 'wamid.fixture' })
  assert.deepEqual(await sendCloudText(config, { to: template.to, body: 'Olá!', operationId: 'reply-op' }, request), {
    kind: 'accepted', messageId: 'wamid.fixture',
  })
  assert.equal(requests.length, 2)
  for (const { url, init } of requests) {
    assert.equal(url, 'https://graph.facebook.com/v25.0/123/messages')
    assert.equal(init?.method, 'POST')
    assert.equal(init?.redirect, 'error')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-access')
    assert.ok(init?.signal)
  }
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: '13055550100',
    type: 'template', template: { name: 'follow_up', language: { code: 'pt_BR' } }, biz_opaque_callback_data: 'test-operation',
  })
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: '13055550100',
    type: 'text', text: { body: 'Olá!' }, biz_opaque_callback_data: 'reply-op',
  })
})

test('Cloud rejects invalid local input before invoking Meta', async () => {
  const request: typeof fetch = async () => assert.fail('unexpected transport invocation')
  const rejected = { kind: 'rejected', code: null }
  assert.deepEqual(await sendCloudTemplate(config, { ...template, to: '123456@g.us' }, request), rejected)
  assert.deepEqual(await sendCloudTemplate(config, { ...template, name: 'Invalid name' }, request), rejected)
  assert.deepEqual(await sendCloudTemplate(config, { ...template, language: 'pt-br' }, request), rejected)
  assert.deepEqual(await sendCloudTemplate(config, { ...template, operationId: 'a'.repeat(513) }, request), rejected)
  assert.deepEqual(await sendCloudTemplate(config, { ...template, operationId: 'op\n' }, request), rejected)
  assert.deepEqual(await sendCloudText(config, { to: template.to, body: ' ', operationId: 'op' }, request), rejected)
  assert.deepEqual(await sendCloudText(config, { to: template.to, body: 'a'.repeat(4097), operationId: 'op' }, request), rejected)
})

test('dispatch preserves already normalized short international recipients', async () => {
  for (const to of ['4740000000', '29012345']) {
    let sentTo = ''
    const request: typeof fetch = async (_url, init) => {
      sentTo = JSON.parse(String(init?.body)).to
      return Response.json({ messages: [{ id: 'wamid.fixture' }] })
    }
    assert.deepEqual(await sendCloudTemplate(config, { ...template, to }, request), { kind: 'accepted', messageId: 'wamid.fixture' })
    assert.equal(sentTo, to)
  }
})

test('Cloud distinguishes definite validation rejections from ambiguous results without replay', async () => {
  const error = { code: 132001, message: 'fixture provider error details' }
  const cases = [
    { response: () => Response.json({ error }, { status: 400 }), kind: 'rejected', code: 132001 },
    { response: () => Response.json({ error: { ...error, is_transient: true } }, { status: 400 }), kind: 'unknown', code: 132001 },
    { response: () => Response.json({ error }, { status: 500 }), kind: 'unknown', code: 132001 },
    { response: () => Response.json({ error }, { status: 429 }), kind: 'unknown', code: 132001 },
    { response: () => Response.json({ error: { code: 1 } }, { status: 400 }), kind: 'unknown', code: 1 },
    { response: () => Response.json({ messages: [{ id: 'missing-wamid-prefix' }] }), kind: 'unknown', code: null },
    { response: () => Response.json({ messages: [{ id: 'wamid.bad\n' }] }), kind: 'unknown', code: null },
    { response: () => Response.json({ messages: [{ id: 'wamid.a' }, { id: 'wamid.b' }] }), kind: 'unknown', code: null },
    { response: () => new Response('malformed'), kind: 'unknown', code: null },
    { response: () => { throw new DOMException('fixture network details', 'TimeoutError') }, kind: 'unknown', code: null },
  ]
  for (const { response, kind, code } of cases) {
    let requests = 0
    const request: typeof fetch = async () => {
      requests++
      return response()
    }
    assert.deepEqual(await sendCloudTemplate(config, template, request), { kind, code })
    assert.equal(requests, 1)
  }
})
