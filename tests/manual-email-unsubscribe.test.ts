import test from 'node:test'
import assert from 'node:assert/strict'
import { handleEmailUnsubscribe } from '../src/lib/manual-email-unsubscribe'

const token = '00000000-0000-4000-8000-000000000001'

test('unsubscribe GET only confirms; POST suppresses by opaque token, without login or exposing email', async () => {
  let writes = 0
  const suppress = async (value: string) => { assert.equal(value, token); writes++; return true }
  const url = `https://example.invalid/api/leads/email/unsubscribe?token=${token}`
  const get = await handleEmailUnsubscribe(new Request(url), suppress)
  assert.equal(get.status, 200)
  assert.match(await get.text(), /method="post"/)
  assert.equal(writes, 0, 'mail security scanners must not unsubscribe on GET')
  for (const body of ['', 'List-Unsubscribe=One-Click']) {
    const response = await handleEmailUnsubscribe(new Request(url, { method: 'POST', body }), suppress)
    assert.equal(response.status, 200)
    assert.doesNotMatch(await response.text(), /@|example.invalid/)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
  }
  assert.equal(writes, 2)
  const invalid = await handleEmailUnsubscribe(new Request('https://example.invalid/?token=<script>'), suppress)
  assert.equal(invalid.status, 400)
  assert.equal(writes, 2)
  assert.equal((await handleEmailUnsubscribe(new Request(url, { method: 'POST' }), async () => false)).status, 404)
  const failed = await handleEmailUnsubscribe(new Request(url, { method: 'POST' }), async () => { throw new Error('private database detail') })
  assert.equal(failed.status, 503)
  assert.doesNotMatch(await failed.text(), /private/)
})
