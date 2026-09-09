import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createEmailDependencies } from '../src/lib/manual-email-server'
import { handleManualEmailHttp } from '../src/lib/manual-email-http'

const buyerId = '00000000-0000-4000-8000-000000000001'
const leadId = '00000000-0000-4000-8000-000000000002'
const requestId = '00000000-0000-4000-8000-000000000003'
const env = { RESEND_API_KEY: 'mock-only', RESEND_FROM_EMAIL: 'Lead4Pro <mail@example.invalid>', MANUAL_EMAIL_POSTAL_ADDRESS: '123 Example Street', NEXT_PUBLIC_APP_URL: 'https://example.invalid' }

test('HTTP + real Supabase adapter: session owner filters, provider idempotency, persistence and no external writes', async () => {
  const writes: string[] = [], sends: Record<string, unknown>[] = []
  const databaseFetch: typeof fetch = async (resource, init) => {
    const url = new URL(String(resource)), table = url.pathname.split('/').pop()
    const body = init?.body ? JSON.parse(String(init.body)) : null
    if (table === 'leads') {
      assert.equal(url.searchParams.get('assigned_to'), `eq.${buyerId}`)
      assert.ok(url.searchParams.has('id'))
      return Response.json([{ id: leadId, assigned_to: buyerId, name: 'Maria', email: 'maria@example.invalid' }])
    }
    if (table === 'manual_email_preferences') {
      if (init?.method === 'POST') { writes.push('preference'); assert.equal(body.buyer_id, buyerId); assert.equal(body.suppressed_at, undefined); return Response.json(null) }
      assert.equal(url.searchParams.get('buyer_id'), `eq.${buyerId}`)
      return Response.json(url.searchParams.get('email')?.startsWith('eq.') ? { email: 'maria@example.invalid', token: requestId, suppressed_at: null } : [])
    }
    if (table === 'reserve_manual_email') {
      writes.push('reserve')
      assert.equal(body.p_buyer_id, buyerId)
      return Response.json({ id: requestId, fresh: true, payload_hash: body.p_hash, status: 'processing', results: [] })
    }
    if (table === 'manual_email_batches') {
      writes.push('finish')
      assert.equal(url.searchParams.get('buyer_id'), `eq.${buyerId}`)
      assert.equal(url.searchParams.get('id'), `eq.${requestId}`)
      assert.equal(body.status, 'completed')
      return Response.json([{ id: requestId }])
    }
    throw new Error(`Unexpected mocked database call: ${table}`)
  }
  const db = createClient('https://database.example.invalid', 'mock-only', { global: { fetch: databaseFetch }, auth: { persistSession: false, autoRefreshToken: false } })
  const providerFetch: typeof fetch = async (resource, init) => {
    assert.equal(String(resource), 'https://api.resend.com/emails')
    assert.ok(new Headers(init?.headers).get('Idempotency-Key')?.startsWith('manual-email/'))
    assert.ok(init?.signal)
    sends.push(JSON.parse(String(init?.body)))
    return Response.json({ id: 'mock-accepted-not-delivered' })
  }
  const deps = () => createEmailDependencies(db, async () => ({ id: buyerId }), env, providerFetch)
  const payload = { leadIds: [leadId], requestId, subject: 'Olá', body: 'Mensagem', confirmed: true, consentConfirmed: true, buyer_id: 'ignored' }
  const req = (body: unknown) => new Request('https://example.invalid/api/leads/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.invalid' }, body: JSON.stringify(body) })
  const preview = await (await handleManualEmailHttp(req({ ...payload, preview: true }), deps)).json()
  assert.equal(preview.preview, true)
  assert.equal(writes.length, 0)
  const result = await (await handleManualEmailHttp(req({ ...payload, previewHash: preview.previewHash }), deps)).json()
  assert.equal(result.results[0].status, 'accepted')
  assert.deepEqual(writes, ['reserve', 'preference', 'finish'])
  assert.equal(sends.length, 1)
  assert.equal(sends[0].to, 'maria@example.invalid')
})

test('HTTP rejects cross-origin, malformed JSON and oversized chunked bodies before creating dependencies', async () => {
  const deps = () => { throw new Error('must not create dependencies') }
  for (const [headers, body, status] of [
    [{ 'Content-Type': 'application/json', Origin: 'https://attacker.invalid' }, '{}', 403],
    [{ 'Content-Type': 'text/plain' }, '{}', 415],
    [{ 'Content-Type': 'application/json' }, '{', 400],
    [{ 'Content-Type': 'application/json' }, 'x'.repeat(65537), 413],
  ] as const) {
    const req = new Request('https://example.invalid/api/leads/email', { method: 'POST', headers, body })
    assert.equal((await handleManualEmailHttp(req, deps)).status, status)
  }
})

test('provider/config safety: no onboarding sender, no untrusted origin, 4xx errors are not accepted', async () => {
  const db = createClient('https://database.example.invalid', 'mock-only', { auth: { persistSession: false } })
  for (const bad of [{ ...env, RESEND_FROM_EMAIL: 'onboarding@resend.dev' }, { ...env, MANUAL_EMAIL_POSTAL_ADDRESS: '' }, { ...env, NEXT_PUBLIC_APP_URL: 'http://evil.invalid' }, { ...env, RESEND_API_KEY: '' }]) {
    assert.throws(() => createEmailDependencies(db, async () => null, bad).config())
  }
  const deps = createEmailDependencies(db, async () => null, env, async () => Response.json({ message: 'mock refusal' }, { status: 422 }))
  const result = await deps.send({ from: env.RESEND_FROM_EMAIL, to: 'x@example.invalid', subject: 'test', text: 'test', headers: {} }, 'mock-key')
  assert.ok(result.error)
  assert.equal(result.data, null)
})
