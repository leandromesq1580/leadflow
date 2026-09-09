import test from 'node:test'
import assert from 'node:assert/strict'
import { handleManualEmail, type EmailDependencies, type OwnedLead } from '../src/lib/manual-email'

const buyerId = '00000000-0000-4000-8000-000000000001'
const leadId = '00000000-0000-4000-8000-000000000002'
const otherId = '00000000-0000-4000-8000-000000000003'
const requestId = '00000000-0000-4000-8000-000000000004'
const input = { leadIds: [leadId], subject: 'Olá', body: 'Mensagem pessoal', requestId, confirmed: true, consentConfirmed: true }

function fixture(leads: OwnedLead[] = [{ id: leadId, assigned_to: buyerId, name: 'Maria', email: 'maria@example.invalid' }]) {
  const sends: unknown[] = []
  let queries = 0
  const deps: EmailDependencies = {
    actor: async () => ({ id: buyerId }),
    ownedLeads: async (owner, ids) => { queries++; return leads.filter(l => l.assigned_to === owner && ids.includes(l.id)) },
    preferences: async () => [],
    config: () => ({ from: 'Lead4Pro <mail@example.invalid>', postalAddress: '123 Example St, FL', origin: 'https://example.invalid' }),
    reserve: async () => ({ id: requestId, fresh: true, payload_hash: '', status: 'processing', results: [] }),
    preference: async () => ({ token: requestId, suppressed_at: null }),
    send: async message => { sends.push(message); return { data: { id: 'mock-provider-id' }, error: null } },
    finish: async () => {},
  }
  return { deps, sends, queryCount: () => queries }
}

test('invalid payloads never reach the database or provider', async () => {
  for (const bad of [null, {}, { ...input, leadIds: [] }, { ...input, leadIds: Array(21).fill(leadId) },
    { ...input, leadIds: ['not-a-uuid'] }, { ...input, subject: 'x\r\nBcc: victim@example.invalid' },
    { ...input, subject: 'x'.repeat(201) }, { ...input, body: 'x'.repeat(10001) },
    { ...input, subject: ' ' }, { ...input, body: ' ' }, { ...input, requestId: 'bad' },
    { ...input, confirmed: false }, { ...input, consentConfirmed: false }]) {
    const f = fixture()
    assert.equal((await handleManualEmail(bad, f.deps)).status, 400)
    assert.equal(f.queryCount(), 0)
    assert.deepEqual(f.sends, [])
  }
})

test('preview is read-only and excludes invalid, duplicate and suppressed mailboxes', async () => {
  const f = fixture([
    { id: leadId, assigned_to: buyerId, name: 'Maria', email: ' MARIA@example.invalid ' },
    { id: otherId, assigned_to: buyerId, name: 'Duplicado', email: 'maria@example.invalid' },
  ])
  f.deps.reserve = async () => { throw new Error('Preview must not reserve') }
  f.deps.preference = async () => { throw new Error('Preview must not write preferences') }
  const response = await handleManualEmail({ ...input, preview: true, leadIds: [otherId, leadId, leadId] }, f.deps)
  const data = await response.json()
  assert.equal(data.preview, true)
  assert.equal(data.recipients[0].email, 'maria@example.invalid')
  assert.equal(data.recipients[0].status, 'ready')
  assert.equal(data.recipients[1].reason, 'email_duplicado')
  assert.equal(data.subject, input.subject)
  assert.match(data.footer, /123 Example St/)
  assert.equal(data.previewHash.length, 64)
  assert.deepEqual(f.sends, [])

  f.deps.preferences = async () => [{ email: 'maria@example.invalid', token: requestId, suppressed_at: '2026-01-01' }]
  const suppressed = await (await handleManualEmail({ ...input, preview: true }, f.deps)).json()
  assert.equal(suppressed.recipients[0].reason, 'descadastrado')
  f.deps.ownedLeads = async () => [{ id: leadId, assigned_to: buyerId, name: 'Sem email', email: 'bad\r\nBcc:x@y.com' }]
  const invalid = await (await handleManualEmail({ ...input, preview: true }, f.deps)).json()
  assert.equal(invalid.recipients[0].reason, 'email_invalido')
})

test('confirmed send uses one plain-text recipient and durable replay never sends twice', async () => {
  const f = fixture()
  const preview = await (await handleManualEmail({ ...input, preview: true, body: '<script>alert(1)</script>' }, f.deps)).json()
  let reservation: Awaited<ReturnType<EmailDependencies['reserve']>> | undefined
  f.deps.reserve = async (owner, key, hash) => {
    assert.equal(owner, buyerId)
    assert.equal(key, requestId)
    if (reservation) return { ...reservation, fresh: false }
    reservation = { id: requestId, fresh: true, payload_hash: hash, status: 'processing', results: [] }
    return reservation
  }
  f.deps.finish = async (_id, owner, results) => {
    assert.equal(owner, buyerId)
    reservation!.status = 'completed'
    reservation!.results = results
  }
  const payload = { ...input, body: '<script>alert(1)</script>', previewHash: preview.previewHash }
  const first = await (await handleManualEmail(payload, f.deps)).json()
  assert.deepEqual(first.results, [{ leadId, status: 'accepted' }])
  assert.equal(f.sends.length, 1)
  const message = f.sends[0] as Record<string, unknown>
  assert.equal(message.to, 'maria@example.invalid')
  assert.equal(message.subject, input.subject)
  assert.equal(message.html, undefined)
  assert.equal(message.cc, undefined)
  assert.equal(message.bcc, undefined)
  assert.match(String(message.text), /<script>alert\(1\)<\/script>/)
  assert.match(String(message.text), /https:\/\/example.invalid\/api\/leads\/email\/unsubscribe\?token=/)
  const repeated = await (await handleManualEmail(payload, f.deps)).json()
  assert.deepEqual(repeated.results, first.results)
  assert.equal(repeated.replayed, true)
  assert.equal(f.sends.length, 1)
  const changed = await (await handleManualEmail({ ...input, preview: true, subject: 'Alterado' }, f.deps)).json()
  assert.equal((await handleManualEmail({ ...input, subject: 'Alterado', previewHash: changed.previewHash }, f.deps)).status, 409)
  assert.equal(f.sends.length, 1)
})

test('provider refusal and uncertain transport outcomes are distinct and never called delivered', async () => {
  for (const outcome of ['refused', 'timeout', 'empty'] as const) {
    const f = fixture()
    const preview = await (await handleManualEmail({ ...input, preview: true }, f.deps)).json()
    let calls = 0
    f.deps.send = async () => {
      calls++
      if (outcome === 'timeout') throw new Error('private provider detail')
      return { data: null, error: outcome === 'refused' ? { message: 'secret provider error' } : null }
    }
    const response = await handleManualEmail({ ...input, previewHash: preview.previewHash }, f.deps)
    const data = await response.json()
    assert.equal(data.results[0].status, outcome === 'refused' ? 'failed' : 'unknown')
    assert.equal(calls, 1)
    assert.doesNotMatch(JSON.stringify(data), /secret|private|delivered/)
  }
})

test('a changed owner or new opt-out during a batch is rechecked just before sending', async () => {
  for (const change of ['owner', 'optout']) {
    const f = fixture()
    const preview = await (await handleManualEmail({ ...input, preview: true }, f.deps)).json()
    if (change === 'owner') {
      let calls = 0
      const owned = f.deps.ownedLeads
      f.deps.ownedLeads = async (...args) => ++calls === 1 ? owned(...args) : []
    } else f.deps.preference = async () => ({ token: requestId, suppressed_at: '2026-01-01' })
    const response = await (await handleManualEmail({ ...input, previewHash: preview.previewHash }, f.deps)).json()
    assert.equal(response.results[0].status, 'skipped')
    assert.equal(f.sends.length, 0)
  }
})

test('database/config failures fail closed without exposing details', async () => {
  for (const dependency of ['actor', 'ownedLeads', 'preferences', 'config', 'reserve'] as const) {
    const f = fixture()
    const preview = await (await handleManualEmail({ ...input, preview: true }, f.deps)).json()
    Object.assign(f.deps, { [dependency]: () => { throw new Error('database password private') } })
    const response = await handleManualEmail({ ...input, previewHash: preview.previewHash }, f.deps)
    assert.equal(response.status, 503)
    assert.doesNotMatch(await response.text(), /password|private/)
    assert.equal(f.sends.length, 0)
  }
})

test('rate-limited reservations return 429 without sending', async () => {
  const f = fixture()
  const preview = await (await handleManualEmail({ ...input, preview: true }, f.deps)).json()
  f.deps.reserve = async () => ({ id: requestId, fresh: true, payload_hash: '', status: 'processing', results: [], limited: true })
  assert.equal((await handleManualEmail({ ...input, previewHash: preview.previewHash }, f.deps)).status, 429)
  assert.equal(f.sends.length, 0)
})

test('anonymous sessions and pending replays cannot send', async () => {
  const anonymous = fixture()
  anonymous.deps.actor = async () => null
  assert.equal((await handleManualEmail(input, anonymous.deps)).status, 401)
  assert.equal(anonymous.queryCount(), 0)
  const f = fixture()
  const preview = await (await handleManualEmail({ ...input, preview: true }, f.deps)).json()
  f.deps.reserve = async () => ({ id: requestId, fresh: false, payload_hash: preview.previewHash, status: 'processing', results: [] })
  assert.equal((await handleManualEmail({ ...input, previewHash: preview.previewHash }, f.deps)).status, 409)
  assert.equal(f.sends.length, 0)
})

test('partial batches report independent accepted, failed and skipped outcomes without sharing recipients', async () => {
  const thirdId = '00000000-0000-4000-8000-000000000005'
  const f = fixture([
    { id: leadId, assigned_to: buyerId, name: 'Maria', email: 'maria@example.invalid' },
    { id: otherId, assigned_to: buyerId, name: 'Pedro', email: 'pedro@example.invalid' },
    { id: thirdId, assigned_to: buyerId, name: 'Sem email', email: null },
  ])
  const payload = { ...input, leadIds: [leadId, otherId, thirdId] }
  const preview = await (await handleManualEmail({ ...payload, preview: true }, f.deps)).json()
  f.deps.send = async message => {
    f.sends.push(message)
    return message.to.startsWith('maria') ? { data: { id: 'mock' }, error: null } : { data: null, error: 'mock refusal' }
  }
  const data = await (await handleManualEmail({ ...payload, previewHash: preview.previewHash }, f.deps)).json()
  assert.deepEqual(data.results.map((r: { status: string }) => r.status), ['accepted', 'failed', 'skipped'])
  assert.equal(f.sends.length, 2)
  for (const raw of f.sends) {
    const message = raw as { to: string; text: string }
    assert.equal(typeof message.to, 'string')
    assert.doesNotMatch(message.text, /maria@|pedro@/)
  }
})

test('failed result persistence never returns success and changed previews cannot send', async () => {
  const f = fixture()
  const preview = await (await handleManualEmail({ ...input, preview: true }, f.deps)).json()
  assert.equal((await handleManualEmail({ ...input, subject: 'changed', previewHash: preview.previewHash }, f.deps)).status, 409)
  assert.equal(f.sends.length, 0)
  f.deps.finish = async () => { throw new Error('database unavailable') }
  assert.equal((await handleManualEmail({ ...input, previewHash: preview.previewHash }, f.deps)).status, 503)
  assert.equal(f.sends.length, 1)
})

test('entire batch is rejected before any send when an ID is not owned by the session', async () => {
  const f = fixture()
  const response = await handleManualEmail({ ...input, leadIds: [leadId, otherId], buyer_id: otherId }, f.deps)
  assert.equal(response.status, 403)
  assert.deepEqual(f.sends, [])
  assert.deepEqual(await response.json(), { error: 'Um ou mais leads não pertencem à sua conta.' })
})
