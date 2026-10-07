import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ModuleKind, transpileModule } from 'typescript'
import * as routing from '../src/lib/wa-conversation-routing'

// Synthetic local payloads; this exercises the actual route, not production data.
function loadModule(path: string, dependencies: Record<string, unknown>) {
  const code = transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS, target: 7 },
  }).outputText
  const loaded = { exports: {} as Record<string, (request: Request) => Promise<Response>> }
  new Function('require', 'module', 'exports', code)((name: string) => {
    if (name === '@/lib/wa-message-content') return loadModule('../src/lib/wa-message-content.ts', {})
    assert.ok(name in dependencies, `Unexpected dependency ${name}`)
    return dependencies[name]
  }, loaded, loaded.exports)
  return loaded.exports
}

function fixture() {
  const calls = { admin: 0, database: 0, push: 0 }
  const post = loadModule('../src/app/api/webhook/wa-bridge/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/supabase/admin': { createAdminClient: () => {
      calls.admin++
      return { from: () => {
        calls.database++
        const chain: object = new Proxy({}, { get: (_, key) => key === 'then'
          ? (accept: (value: unknown) => void) => Promise.resolve({ data: { id: 'duplicate' } }).then(accept)
          : () => chain })
        return chain
      } }
    } },
    '@/lib/wa-conversation-routing': routing,
    '@/lib/buyer-locale': {},
    '@/lib/push-notify': { pushToBuyer: async () => { calls.push++ } },
  }).POST
  return { calls, async send(overrides: Record<string, unknown> = {}) {
    return post(new Request('https://example.invalid/api/webhook/wa-bridge', {
      method: 'POST', headers: { apikey: (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_message_id: 'false_15555550100@c.us_SYNTHETIC', from: '15555550100',
        to: '15555550101', direction: 'in', body: '', type: 'e2e_notification', ...overrides }),
    }))
  } }
}

test('technical e2e_notification is acknowledged before creating DB client or any side effect', async () => {
  const f = fixture()
  const response = await f.send()
  assert.deepEqual(f.calls, { admin: 0, database: 0, push: 0 })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { skipped: 'non_message' })
})

test('technical events with text, empty messages and conflicting own echoes cannot reach DB', async () => {
  for (const payload of [
    { type: 'ciphertext', body: 'technical body' },
    { type: 'e2e_notification', body: 'technical body', has_media: true },
    { type: 'notification_template', body: 'technical body' },
    { type: 'gp2', body: 'technical body' },
    { type: 'chat', body: '  ' },
    { type: 'chat', body: 'my send', wa_message_id: 'true_synthetic' },
    { type: 'chat', body: 'my send', wa_message_id: 'true_synthetic', direction: undefined },
  ]) {
    const f = fixture()
    const response = await f.send(payload)
    assert.deepEqual(f.calls, { admin: 0, database: 0, push: 0 }, JSON.stringify(payload))
    assert.equal(response.status, 200)
  }
})

test('real route retains text, emoji, legacy content, undownloaded media and explicit own sends', async () => {
  for (const payload of [
    { type: 'chat', body: 'Olá' },
    { type: 'chat', body: '👍' },
    { type: undefined, body: 'legacy text' },
    { type: undefined, media_type: 'audio' },
    { type: 'audio', has_media: true },
    { type: 'ptt' },
    { type: 'image' },
    { type: 'location' },
    { type: 'vcard' },
    { type: 'chat', body: 'my send', wa_message_id: 'true_synthetic', direction: 'out' },
  ]) {
    const f = fixture()
    const response = await f.send(payload)
    assert.deepEqual(f.calls, { admin: 1, database: 1, push: 0 }, JSON.stringify(payload))
    assert.deepEqual(await response.json(), { skipped: 'duplicate' })
  }
})
