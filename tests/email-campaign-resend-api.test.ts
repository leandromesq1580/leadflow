import test from 'node:test'
import assert from 'node:assert/strict'
import { createCampaignHandlers } from '../src/lib/email-campaign-api'
import { campaignConfiguration, type CampaignProvider, type TrackingStatus } from '../src/lib/email-campaigns'
import { campaignProvider } from '../src/lib/email-campaign-provider'
// Synthetic only: no network, no mail. Provider is injected or fetch is stubbed.
const actor = '00000000-0000-0000-0000-000000000001'
const origin = '00000000-0000-0000-0000-00000000aaaa'
const ready = campaignConfiguration({ RESEND_API_KEY: 'synthetic-only', RESEND_FROM_EMAIL: 'seguro@example.invalid', MANUAL_EMAIL_POSTAL_ADDRESS: 'Synthetic postal address', EMAIL_CAMPAIGN_WEBHOOK_SECRET: 'synthetic-webhook', EMAIL_CAMPAIGNS_ENABLED: 'true' })
function fixture(tracking: TrackingStatus | 'throw' = { open: true, click: true, status: 'verified', checked_at: '2026-01-01T00:00:00.000Z' }) {
  const calls: [string, Record<string, unknown>][] = []
  const provider: CampaignProvider = { verifyDomain: async () => true, send: async () => { throw new Error('no real sends') }, trackingStatus: async () => { if (tracking === 'throw') throw new Error('provider down'); return tracking } }
  const handlers = createCampaignHandlers({ authenticate: async () => ({ id: actor }), runtime: () => ({ config: ready, provider, db: { rpc: async (n, a) => { calls.push([n, a]); return { data: n === 'ec_list' ? { campaigns: [], recipients: [] } : n === 'ec_resend_preview' ? { allowed: true, eligible: 2 } : n === 'ec_resend_create' ? { existing: false, campaign: { id: origin } } : { id: origin }, error: null } } } }) })
  const post = (body: unknown, origin = 'https://lead4producers.com') => handlers.POST(new Request('https://lead4producers.com/api/admin/email-campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) }))
  const get = (q: string) => handlers.GET(new Request('https://lead4producers.com/api/admin/email-campaigns' + q))
  return { calls, post, get }
}
test('GET reports current tracking without secrets, validates engagement filter and passes it to SQL', async () => {
  const a = fixture()
  const r = await a.get('?id=' + origin + '&engagement=unopened'); assert.equal(r.status, 200)
  const body = await r.json()
  assert.deepEqual(body.tracking, { open: true, click: true, status: 'verified', checked_at: '2026-01-01T00:00:00.000Z' })
  assert.equal(JSON.stringify(body).includes('synthetic-only'), false)
  assert.equal(a.calls[0][0], 'ec_list'); assert.equal(a.calls[0][1].p_engagement, 'unopened')
  assert.equal((await a.get('?id=' + origin + '&engagement=all_of_them')).status, 400)
  assert.equal((await a.get('?engagement=opened')).status, 400, 'engagement requires a campaign id')
  const unknown = fixture('throw'); const u = await (await unknown.get('')).json()
  assert.equal(u.tracking.status, 'unknown'); assert.equal(u.tracking.open, null)
})
test('schedule snapshots tracking in the same call; provider failure becomes an unknown snapshot, never a guess', async () => {
  const a = fixture()
  assert.equal((await a.post({ action: 'schedule', id: origin, at: new Date().toISOString(), expected: 2, confirm: true })).status, 200)
  const args = a.calls.find(c => c[0] === 'ec_schedule')![1]
  assert.deepEqual(args.p_tracking, { open: true, click: true, status: 'verified', checked_at: '2026-01-01T00:00:00.000Z' })
  const b = fixture('throw')
  assert.equal((await b.post({ action: 'schedule', id: origin, at: new Date().toISOString(), expected: 2, confirm: true })).status, 200)
  assert.equal((b.calls.find(c => c[0] === 'ec_schedule')![1].p_tracking as TrackingStatus).open, null)
})
test('resend preview/create validate id, origin and tracking; disabled or unknown tracking blocks before SQL', async () => {
  const a = fixture()
  assert.equal((await a.post({ action: 'resend_preview', id: 'bad' })).status, 400)
  assert.equal((await a.post({ action: 'resend_create', id: origin }, 'https://evil.invalid')).status, 403)
  assert.equal(a.calls.length, 0)
  assert.equal((await a.post({ action: 'resend_preview', id: origin })).status, 200); assert.equal(a.calls[0][0], 'ec_resend_preview')
  assert.equal((await a.post({ action: 'resend_create', id: origin })).status, 200); assert.equal(a.calls[1][0], 'ec_resend_create'); assert.equal(a.calls[1][1].p_origin, origin)
  for (const t of [{ open: false, click: false, status: 'verified', checked_at: 'x' }, { open: null, click: null, status: 'unknown', checked_at: 'x' }, 'throw'] as const) {
    const b = fixture(t); const r = await b.post({ action: 'resend_create', id: origin })
    assert.equal(r.status, 409); assert.equal(b.calls.length, 0, 'no draft created without confirmed open tracking')
  }
})
test('provider tracking read is paginated, bounded, and never leaks errors or the key', async () => {
  const seen: string[] = []
  const real = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url); seen.push(u); assert.ok(u.startsWith('https://api.resend.com/'))
    assert.equal(init?.cache, 'no-store'); assert.ok(init?.signal)
    if (u.includes('/domains/dom-2')) return Response.json({ id: 'dom-2', name: 'example.invalid', status: 'verified', open_tracking: false, click_tracking: true, tracking_subdomain: 'track', records: [{ record: 'Tracking', name: 'track', type: 'CNAME', status: 'verified', value: 'synthetic.example.invalid' }] })
    if (u.includes('after=dom-1')) return Response.json({ data: [{ id: 'dom-2', name: 'EXAMPLE.invalid', status: 'verified' }], has_more: false })
    return Response.json({ data: [{ id: 'dom-1', name: 'other.invalid', status: 'verified' }], has_more: true })
  }) as typeof fetch
  try {
    const p = campaignProvider(ready)
    const s = await p.trackingStatus('example.invalid')
    assert.equal(s.open, false); assert.equal(s.click, true); assert.equal(s.status, 'verified'); assert.ok(Date.parse(s.checked_at))
    assert.equal(seen.length, 3)
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch
    const down = await campaignProvider(ready).trackingStatus('example.invalid')
    assert.equal(down.open, null); assert.equal(down.status, 'unknown'); assert.equal(JSON.stringify(down).includes('synthetic-only'), false)
    globalThis.fetch = (async () => Response.json({ data: [], has_more: false })) as typeof fetch
    assert.equal((await campaignProvider(ready).trackingStatus('example.invalid')).status, 'not_found')
  } finally { globalThis.fetch = real }
})
// Resend only tracks opens/clicks after the Tracking CNAME is verified and a tracking subdomain exists; the booleans alone prove nothing.
// Production reference (read-only, 2026-10-11): status verified, open/click false, tracking_subdomain null, no Tracking record.
function detailFixture(detail: Record<string, unknown>) {
  return (async (url: string | URL | Request) => {
    const u = String(url)
    if (u.includes('/domains/dom-1')) return Response.json(detail)
    return Response.json({ data: [{ id: 'dom-1', name: 'example.invalid', status: 'verified' }], has_more: false })
  }) as typeof fetch
}
const verifiedCname = { record: 'Tracking', name: 'track.example.invalid', type: 'CNAME', status: 'verified', value: 'synthetic-target.example.invalid' }
test('tracking flags without a verified Tracking CNAME are not effective: status not_verified, safe issue, no record values leaked', async () => {
  const real = globalThis.fetch
  try {
    const cases: [string, Record<string, unknown>][] = [
      ['production-like: flags off, no subdomain, no records', { id: 'dom-1', name: 'example.invalid', status: 'verified', open_tracking: false, click_tracking: false, tracking_subdomain: null, records: [] }],
      ['flags on but subdomain missing and no Tracking record', { id: 'dom-1', name: 'example.invalid', status: 'verified', open_tracking: true, click_tracking: true, tracking_subdomain: null, records: [{ record: 'SPF', name: 'send', type: 'TXT', status: 'verified', value: 'v=spf1' }] }],
      ['flags on, Tracking record not_started', { id: 'dom-1', name: 'example.invalid', status: 'verified', open_tracking: true, click_tracking: true, tracking_subdomain: 'track', records: [{ ...verifiedCname, status: 'not_started' }] }],
      ['flags on, Tracking record pending', { id: 'dom-1', name: 'example.invalid', status: 'verified', open_tracking: true, click_tracking: true, tracking_subdomain: 'track', records: [{ ...verifiedCname, status: 'pending' }] }],
      ['flags on, Tracking record verified but subdomain empty', { id: 'dom-1', name: 'example.invalid', status: 'verified', open_tracking: true, click_tracking: true, tracking_subdomain: '', records: [verifiedCname] }],
      ['flags on, Tracking record verified but name belongs to another host', { id: 'dom-1', name: 'example.invalid', status: 'verified', open_tracking: true, click_tracking: true, tracking_subdomain: 'track', records: [{ ...verifiedCname, name: 'track.other.invalid' }] }],
      ['flags on, verified record is a TXT, not the CNAME', { id: 'dom-1', name: 'example.invalid', status: 'verified', open_tracking: true, click_tracking: true, tracking_subdomain: 'track', records: [{ ...verifiedCname, type: 'TXT' }] }],
    ]
    for (const [label, detail] of cases) {
      globalThis.fetch = detailFixture(detail)
      const s = await campaignProvider(ready).trackingStatus('example.invalid')
      assert.notEqual(s.open, true, label); assert.notEqual(s.click, true, label)
      assert.equal(s.status, 'not_verified', label); assert.equal(s.issue, 'tracking_dns_not_verified', label)
      const text = JSON.stringify(s)
      assert.equal(text.includes('synthetic-target'), false, label); assert.equal(text.includes('track.example'), false, label); assert.equal(text.includes('synthetic-only'), false, label)
    }
  } finally { globalThis.fetch = real }
})
test('tracking is confirmed only when domain name matches, sending is verified, subdomain is bounded and the Tracking CNAME is verified with a coherent name', async () => {
  const real = globalThis.fetch
  try {
    for (const [sub, name] of [['track', 'track.example.invalid'], ['track.example.invalid', 'track.example.invalid'], ['track', 'track'], ['TRACK.Example.Invalid', 'track.example.invalid.']]) {
      globalThis.fetch = detailFixture({ id: 'dom-1', name: 'Example.Invalid', status: 'verified', open_tracking: true, click_tracking: true, tracking_subdomain: sub, records: [{ record: 'DKIM', name: 'resend._domainkey', type: 'TXT', status: 'verified', value: 'p=' }, { ...verifiedCname, name }] })
      const s = await campaignProvider(ready).trackingStatus('example.invalid')
      assert.equal(s.open, true, sub + '/' + name); assert.equal(s.click, true, sub + '/' + name); assert.equal(s.status, 'verified'); assert.equal(s.issue, undefined)
    }
    // DNS verified but one flag off: that flag stays an honest false.
    globalThis.fetch = detailFixture({ id: 'dom-1', name: 'example.invalid', status: 'verified', open_tracking: true, click_tracking: false, tracking_subdomain: 'track', records: [verifiedCname] })
    const half = await campaignProvider(ready).trackingStatus('example.invalid')
    assert.equal(half.open, true); assert.equal(half.click, false); assert.equal(half.status, 'verified')
    // Sending domain not verified: nothing is effective even with a verified CNAME.
    globalThis.fetch = detailFixture({ id: 'dom-1', name: 'example.invalid', status: 'pending', open_tracking: true, click_tracking: true, tracking_subdomain: 'track', records: [verifiedCname] })
    const pending = await campaignProvider(ready).trackingStatus('example.invalid')
    assert.notEqual(pending.open, true); assert.notEqual(pending.click, true); assert.equal(pending.status, 'not_verified')
    // Detail for another domain: fail closed.
    globalThis.fetch = detailFixture({ id: 'dom-1', name: 'other.invalid', status: 'verified', open_tracking: true, click_tracking: true, tracking_subdomain: 'track', records: [{ ...verifiedCname, name: 'track.other.invalid' }] })
    const mismatch = await campaignProvider(ready).trackingStatus('example.invalid')
    assert.notEqual(mismatch.open, true); assert.notEqual(mismatch.status, 'verified'); assert.equal(mismatch.issue, 'domain_mismatch')
    // Incomplete responses never become "verified"; unbounded subdomain is rejected.
    for (const detail of [{ id: 'dom-1' }, { id: 'dom-1', name: 'example.invalid', status: 'verified', open_tracking: true, click_tracking: true }, { id: 'dom-1', name: 'example.invalid', status: 'verified', open_tracking: true, click_tracking: true, tracking_subdomain: 'track', records: 'oops' }, { id: 'dom-1', name: 'example.invalid', status: 'verified', open_tracking: true, click_tracking: true, tracking_subdomain: 'a'.repeat(300), records: [{ ...verifiedCname, name: 'a'.repeat(300) }] }, 'not-json']) {
      globalThis.fetch = detail === 'not-json' ? ((async (url: string | URL | Request) => String(url).includes('/domains/dom-1') ? new Response('<html>', { status: 200 }) : Response.json({ data: [{ id: 'dom-1', name: 'example.invalid', status: 'verified' }], has_more: false })) as typeof fetch) : detailFixture(detail as Record<string, unknown>)
      const s = await campaignProvider(ready).trackingStatus('example.invalid')
      assert.notEqual(s.open, true, JSON.stringify(detail).slice(0, 60)); assert.notEqual(s.click, true); assert.ok(s.status === 'unknown' || s.status === 'not_verified', s.status)
    }
  } finally { globalThis.fetch = real }
})
