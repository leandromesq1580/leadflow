import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test, { type TestContext } from 'node:test'
import { GET, POST } from '../src/app/api/webhook/whatsapp-cloud/route'
import { COMPANY_WHATSAPP_PHONE } from '../src/lib/wa-cloud'
import { parseWhatsAppCloudEvents } from '../src/lib/wa-cloud-webhook'

const sender = { wabaId: '100001', phoneNumberId: '100002' }
const phone = '15555550100'
const messageId = 'wamid.synthetic_reply'
const operationId = '01a1d138-d396-4d13-a32e-dcc708553d68'
const appSecret = 'synthetic-app-secret'
const verifyToken = 'synthetic-verify-token'
const webhookSecret = 'synthetic-kapso-webhook-secret'
const callback = 'https://example.invalid/api/webhook/whatsapp-cloud'

function setEnvironment(t: TestContext, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    const original = process.env[name]
    process.env[name] = value
    t.after(() => { if (original === undefined) delete process.env[name]; else process.env[name] = original })
  }
}

const sharedEnv = {
  WA_CLOUD_WABA_ID: sender.wabaId,
  WA_CLOUD_PHONE_NUMBER_ID: sender.phoneNumberId,
  WA_CLOUD_GRAPH_VERSION: 'v25.0',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
}

function textMessage(body: string, overrides: Record<string, unknown> = {}) {
  return { type: 'text', text: { body }, from: phone, id: messageId, timestamp: '1794487200', ...overrides }
}

function statusMessage(overrides: Record<string, unknown> = {}) {
  return { id: 'wamid.synthetic_out', recipient_id: phone, biz_opaque_callback_data: operationId, status: 'delivered', ...overrides }
}

function change(value: Record<string, unknown>, phoneNumberId = sender.phoneNumberId, field = 'messages') {
  return { field, value: { messaging_product: 'whatsapp', metadata: { phone_number_id: phoneNumberId, display_phone_number: '+1 786 744 2126' }, ...value } }
}

function payload(...changes: ReturnType<typeof change>[]) {
  return { object: 'whatsapp_business_account', entry: [{ id: sender.wabaId, changes }] }
}

test('signed-message parser uses the exact account and phone, and ignores echoes and technical events', () => {
  const event = change({ messages: [textMessage('STOP')] })
  assert.deepEqual(parseWhatsAppCloudEvents({ ...payload(event), object: 'page' }, sender), [])
  assert.deepEqual(parseWhatsAppCloudEvents({ ...payload(event), entry: [{ id: '900001', changes: [event] }] }, sender), [])
  assert.deepEqual(parseWhatsAppCloudEvents(payload(
    change(event.value, sender.phoneNumberId, 'smb_message_echoes'),
    { ...event, value: { ...event.value, metadata: { phone_number_id: '900002', display_phone_number: COMPANY_WHATSAPP_PHONE } } },
    change({ ...event.value, metadata: { phone_number_id: sender.phoneNumberId, display_phone_number: '12025550145' } }),
    change({ messages: [
      textMessage('STOP', { from: COMPANY_WHATSAPP_PHONE }),
      textMessage('STOP', { type: 'reaction' }),
      textMessage('STOP', { from: '+1 (555) 555-0100' }),
      textMessage('STOP', { timestamp: '1.2' }),
      textMessage('STOP', { id: 'invalid' }),
      textMessage('   '),
    ] }),
  ), sender), [])
})

test('parser preserves inbound timestamp and replies, and changes consent only on explicit commands', () => {
  const events = parseWhatsAppCloudEvents(payload(change({ messages: [
    textMessage('  Olá\u0000!  ', { context: { id: 'wamid.synthetic_out' } }),
    textMessage('aceito receber mensagens'),
    textMessage('I agree to receive messages'),
    textMessage('Acepto recibir mensajes'),
    textMessage('please stop by at five'),
    textMessage('No me contacte.'),
    textMessage('', { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'STOP_ALERTS', title: 'Não quero receber' } } }),
    textMessage('', { type: 'button', button: { text: 'ACEITO RECEBER MENSAGENS', payload: 'marketing' } }),
    textMessage('', { type: 'audio', audio: { id: 'synthetic-audio' } }),
  ] })), sender).filter(event => event.type === 'inbound')

  assert.deepEqual(events[0], {
    type: 'inbound', phone, messageId, eventAt: new Date(1794487200 * 1000).toISOString(),
    replyTo: 'wamid.synthetic_out', subscribed: null, body: 'Olá!',
  })
  assert.deepEqual(events.map(event => event.subscribed), [null, true, true, true, null, false, false, null, null])
  assert.equal(events[5].body, 'No me contacte.')
  assert.equal(events[6].body, 'Não quero receber')
  assert.equal(events[8].body, '[Áudio]')
})

test('valid statuses are delivery receipts with a UUID or exact-WAMID fallback', () => {
  const events = parseWhatsAppCloudEvents(payload(change({ statuses: [
    statusMessage({ status: 'sent' }),
    statusMessage(),
    statusMessage({ status: 'read' }),
    statusMessage({ status: 'failed' }),
    statusMessage({ status: 'deleted' }),
    statusMessage({ id: 'unknown' }),
    statusMessage({ biz_opaque_callback_data: 'unknown' }),
    statusMessage({ biz_opaque_callback_data: '' }),
    statusMessage({ recipient_id: '' }),
    statusMessage({ biz_opaque_callback_data: undefined }),
    statusMessage({ biz_opaque_callback_data: null }),
  ] })), sender)
  const base = { type: 'status', phone, messageId: 'wamid.synthetic_out' }
  assert.deepEqual(events, [
    ...['sent', 'delivered', 'read', 'failed'].map(status => ({ ...base, operationId, status })),
    { ...base, operationId: null, status: 'delivered' },
    { ...base, operationId: null, status: 'delivered' },
  ])
})

test('webhook verifies raw bytes, handles Meta challenge and returns a retryable response on write failure', async t => {
  setEnvironment(t, {
    ...sharedEnv,
    WA_CLOUD_PROVIDER: 'meta',
    WA_CLOUD_ACCESS_TOKEN: 'synthetic-token',
    WA_CLOUD_APP_SECRET: appSecret,
    WA_CLOUD_VERIFY_TOKEN: verifyToken,
    WA_CLOUD_KAPSO_WEBHOOK_SECRET: webhookSecret,
  })

  const challenge = new URL(callback)
  challenge.search = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.challenge': '0001234', 'hub.verify_token': verifyToken }).toString()
  const verified = GET(new Request(challenge))
  assert.equal(verified.status, 200)
  assert.equal(await verified.text(), '0001234')
  challenge.searchParams.set('hub.verify_token', 'wrong-token')
  assert.equal(GET(new Request(challenge)).status, 403)

  const rpcCalls: Array<{ path: string; body: unknown }> = []
  let failWrite = false
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    assert.ok(init?.signal instanceof AbortSignal)
    rpcCalls.push({ path: new URL(url).pathname, body: JSON.parse(String(init?.body)) })
    return failWrite ? Response.json({ code: '55P03' }, { status: 500 }) : Response.json(true)
  })

  const raw = JSON.stringify(payload(change({ messages: [textMessage('STOP')], statuses: [statusMessage()] })), null, 2)
  const signature = `sha256=${createHmac('sha256', appSecret).update(raw).digest('hex')}`
  const request = (body: string, hash = signature) => new Request(callback, {
    method: 'POST', headers: { 'x-hub-signature-256': hash }, body,
  })
  assert.equal((await POST(request(raw, 'sha256=bad'))).status, 403)
  assert.equal((await POST(request(raw + '\n'))).status, 403)
  assert.equal((await POST(new Request(callback, {
    method: 'POST', headers: { 'x-webhook-signature': createHmac('sha256', webhookSecret).update(raw).digest('hex') }, body: raw,
  }))).status, 403)
  assert.equal((await POST(new Request(callback, {
    method: 'POST', headers: { 'content-length': '3145729' },
  }))).status, 413)
  assert.deepEqual(rpcCalls, [])
  assert.equal((await POST(request(raw))).status, 200)
  assert.deepEqual(rpcCalls, [
    { path: '/rest/v1/rpc/apply_wa_cloud_inbound', body: {
      p_phone: phone, p_event_at: new Date(1794487200 * 1000).toISOString(), p_message_id: messageId,
      p_subscribed: false, p_body: 'STOP', p_reply_to: null,
    } },
    { path: '/rest/v1/rpc/apply_wa_cloud_status', body: {
      p_operation_id: operationId, p_message_id: 'wamid.synthetic_out', p_status: 'delivered', p_phone: phone,
    } },
  ])

  failWrite = true
  assert.equal((await POST(request(raw))).status, 500)
  assert.equal(rpcCalls.length, 3)
})

test('Kapso accepts only its signed raw Meta-format payloads and keeps the existing account and number checks', async t => {
  setEnvironment(t, {
    ...sharedEnv,
    WA_CLOUD_PROVIDER: 'kapso',
    WA_CLOUD_KAPSO_API_KEY: 'synthetic-kapso-api-key',
    WA_CLOUD_KAPSO_WEBHOOK_SECRET: webhookSecret,
    WA_CLOUD_APP_SECRET: appSecret,
    WA_CLOUD_VERIFY_TOKEN: verifyToken,
  })

  const noChallenge = GET(new Request(`${callback}?hub.mode=subscribe&hub.challenge=0001234&hub.verify_token=${verifyToken}`))
  assert.equal(noChallenge.status, 405)
  assert.equal(noChallenge.headers.get('Allow'), 'POST')

  const rpcCalls: Array<{ path: string; body: unknown }> = []
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    assert.ok(init?.signal instanceof AbortSignal)
    rpcCalls.push({ path: new URL(url).pathname, body: JSON.parse(String(init?.body)) })
    return Response.json(true)
  })

  const raw = JSON.stringify(payload(change({ messages: [textMessage('PARE')], statuses: [statusMessage()] })), null, 2)
  const sign = (body: string) => createHmac('sha256', webhookSecret).update(body).digest('hex')
  const request = (body: string, signature = sign(body)) => new Request(callback, {
    method: 'POST', headers: { 'x-webhook-signature': signature, 'x-idempotency-key': 'delivery-fixture' }, body,
  })

  assert.equal((await POST(new Request(callback, {
    method: 'POST', headers: { 'x-hub-signature-256': `sha256=${createHmac('sha256', appSecret).update(raw).digest('hex')}` }, body: raw,
  }))).status, 403)
  assert.equal((await POST(request(raw + '\n', sign(raw)))).status, 403)
  assert.equal((await POST(request(raw, `sha256=${sign(raw)}`))).status, 403)
  assert.equal((await POST(request(JSON.stringify(payload(change({ messages: [textMessage('STOP')] }, '900002')))))).status, 200)
  assert.deepEqual(rpcCalls, [])

  assert.equal((await POST(request(raw))).status, 200)
  assert.deepEqual(rpcCalls, [
    { path: '/rest/v1/rpc/apply_wa_cloud_inbound', body: {
      p_phone: phone, p_event_at: new Date(1794487200 * 1000).toISOString(), p_message_id: messageId,
      p_subscribed: false, p_body: 'PARE', p_reply_to: null,
    } },
    { path: '/rest/v1/rpc/apply_wa_cloud_status', body: {
      p_operation_id: operationId, p_message_id: 'wamid.synthetic_out', p_status: 'delivered', p_phone: phone,
    } },
  ])
})
