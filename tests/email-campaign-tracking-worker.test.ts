import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { META_FORM_LANGUAGES } from '../src/lib/lead-language'
import { campaignConfiguration, dispatchCampaigns, type CampaignDb, type CampaignProvider, type TrackingStatus } from '../src/lib/email-campaigns'
// Real worker + real SQL (PGlite, in-process). Synthetic contacts only (example.invalid); the provider is a stub that records sends.
// Guards the promise "open tracking was ON since the first send": the worker re-reads tracking before every round and the SQL
// claim pauses a campaign whose snapshot promised tracking that the provider no longer confirms, before anything is sent.
const actor = '00000000-0000-0000-0000-000000000001'
const forms = JSON.stringify(META_FORM_LANGUAGES)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped RPC rows, same convention as the sibling SQL test
type Json = Record<string, any>
const config = campaignConfiguration({ RESEND_API_KEY: 'synthetic-only', RESEND_FROM_EMAIL: 'seguro@example.invalid', MANUAL_EMAIL_POSTAL_ADDRESS: 'Synthetic postal address', EMAIL_CAMPAIGN_WEBHOOK_SECRET: 'synthetic-webhook', EMAIL_CAMPAIGNS_ENABLED: 'true' })
const verified = (open: boolean, click = open): TrackingStatus => ({ open, click, status: 'verified', checked_at: new Date().toISOString() })
const unknown = (): TrackingStatus => ({ open: null, click: null, status: 'unknown', checked_at: new Date().toISOString() })
async function fixture(t: TestContext) {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table buyers(id uuid primary key, is_admin boolean, name text);
    create table leads(id uuid primary key default gen_random_uuid(),name text,email text,state text,type text default 'hot',assigned_to uuid,lead_language text,form_name text,created_at timestamptz default now());
    insert into buyers(id,is_admin) values ('${actor}',true);
    insert into leads(name,email,state,lead_language) values ('A','a@example.invalid','FL','pt'),('B','b@example.invalid','FL','pt'),('C','c@example.invalid','FL','es');`)
  for (const m of ['062_admin_email_campaigns.sql', '063_email_campaign_tracking_resend.sql', '066_campaign_no_daily_cap.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/' + m, import.meta.url), 'utf8'))
  const rows = async (sql: string, args: unknown[] = []) => (await db.query<Json>(sql, args)).rows
  // Same envelope the Supabase client gives the worker: named parameters, {data,error}.
  const calls: [string, Record<string, unknown>][] = []
  const campaignDb: CampaignDb = { rpc: async (name, args) => { calls.push([name, args]); try { const e = Object.entries(args); const r = await db.query<{ v: Json }>(`select public.${name}(${e.map(([k], i) => `${k} => $${i + 1}`).join(',')}) v`, e.map(([, v]) => v !== null && typeof v === 'object' ? JSON.stringify(v) : v)); return { data: r.rows[0].v, error: null } } catch (e) { return { data: null, error: { message: (e as Error).message } } } } }
  const rpc = async (name: string, args: unknown[] = []) => (await db.query<{ r: Json }>(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args)).rows[0].r
  await rpc('ec_record_permission', [actor, '{}', forms, 'Synthetic documented insurance consent fixture', true])
  const schedule = async (name: string, tracking: TrackingStatus | null) => {
    const c = await rpc('ec_save', [actor, null, JSON.stringify({ name, subject_pt: 'Olá {{nome}}', body_pt: 'Seguro.', subject_es: 'Hola {{nome}}', body_es: 'Seguro.', filters: {} })])
    await rpc('ec_schedule', [actor, c.id, new Date().toISOString(), forms, null, tracking ? JSON.stringify(tracking) : null])
    return c.id as string
  }
  const reset = () => db.exec('update email_campaign_rate set minute_used=0,day_used=0')
  const snapshot = async (id: string) => rows('select r.id,r.state,r.reason,r.provider_id,r.accepted_at,r.lease,c.state campaign_state,c.tracking_snapshot from email_campaign_recipients r join email_campaigns c on c.id=r.campaign_id where c.id=$1 order by r.id', [id])
  let providers = 0
  const provider = (status: () => TrackingStatus) => { const sent: string[] = [], tag = 'prov-' + (++providers) + '-'; const p: CampaignProvider & { sent: string[]; reads: number } = { sent, reads: 0, verifyDomain: async () => true, trackingStatus: async () => { p.reads++; return status() }, send: async payload => { sent.push(payload.to[0]); return { data: { id: tag + sent.length + '-' + payload.to[0] }, error: null } } }; return p }
  return { db, rows, rpc, campaignDb, calls, schedule, reset, snapshot, provider }
}

test('tracking promised at scheduling but not confirmed by the provider at send time: paused before any send, rows untouched', async t => {
  const f = await fixture(t)
  const id = await f.schedule('Origem rastreada', verified(true))
  const before = await f.snapshot(id)
  assert.equal(before.length, 3); assert.ok(before.every(r => r.state === 'pending' && r.campaign_state === 'scheduled'))
  for (const current of [() => verified(false), () => unknown(), () => ({ ...verified(true), status: 'not_verified' as const, open: false, click: false })]) {
    await f.reset()
    const p = f.provider(current)
    const result = await dispatchCampaigns(f.campaignDb, p, config)
    assert.deepEqual(p.sent, [], 'no e-mail may leave while the promised tracking is not confirmed')
    assert.equal(result.accepted + result.refused + result.unknown, 0)
    const c = (await f.rows('select state,pause_reason,tracking_snapshot from email_campaigns where id=$1', [id]))[0]
    assert.equal(c.state, 'paused'); assert.equal(c.pause_reason, 'tracking_not_confirmed')
    assert.deepEqual(c.tracking_snapshot, before[0].tracking_snapshot, 'the snapshot is history, never rewritten')
    const after = await f.snapshot(id)
    assert.deepEqual(after.map(r => ({ id: r.id, state: r.state, reason: r.reason, provider_id: r.provider_id, accepted_at: r.accepted_at, lease: r.lease })), before.map(r => ({ id: r.id, state: r.state, reason: r.reason, provider_id: r.provider_id, accepted_at: r.accepted_at, lease: r.lease })))
    assert.equal((await f.rows('select day_used,minute_used from email_campaign_rate'))[0].day_used, 0, 'no quota consumed')
    assert.equal((await f.rows("select count(*)::int n from email_campaign_audit where campaign_id=$1 and action='pause' and details->>'reason'='tracking_not_confirmed' and actor is null", [id]))[0].n >= 1, true)
    // Resuming by hand puts it back in the queue; the next round decides again.
    await f.rpc('ec_control', [actor, id, 'resume'])
    const resumed = (await f.rows('select state,pause_reason from email_campaigns where id=$1', [id]))[0]
    assert.equal(resumed.state, 'scheduled'); assert.equal(resumed.pause_reason, null)
  }
  // Tracking confirmed again: the same campaign sends normally.
  await f.reset()
  const ok = f.provider(() => verified(true))
  const result = await dispatchCampaigns(f.campaignDb, ok, config)
  assert.equal(result.accepted, 3); assert.equal(ok.sent.length, 3)
  assert.equal((await f.rows('select state from email_campaigns where id=$1', [id]))[0].state, 'completed')
})

test('the worker reads tracking once per round, before the first claim, and hands the normalized status to every claim', async t => {
  const f = await fixture(t)
  await f.schedule('Origem', verified(true))
  await f.reset()
  const p = f.provider(() => ({ ...verified(true), issue: undefined as never, extra: 'ignored' } as TrackingStatus))
  await dispatchCampaigns(f.campaignDb, p, config)
  assert.equal(p.reads, 1)
  const claims = f.calls.filter(c => c[0] === 'ec_claim')
  assert.ok(claims.length >= 3)
  for (const [, args] of claims) {
    const tr = args.p_tracking as Json
    assert.deepEqual(Object.keys(tr).sort(), ['checked_at', 'click', 'open', 'status'])
    assert.equal(tr.open, true); assert.equal(tr.status, 'verified'); assert.equal(args.p_daily, config.dailyLimit)
  }
  // A provider that throws is "unknown" for the worker (fail closed for tracked campaigns, see next test for legacy ones).
  const id = await f.schedule('Outra rastreada', verified(true))
  await f.reset()
  const broken: CampaignProvider = { verifyDomain: async () => true, trackingStatus: async () => { throw new Error('provider down') }, send: async () => { throw new Error('must not send') } }
  const r = await dispatchCampaigns(f.campaignDb, broken, config)
  assert.equal(r.accepted + r.unknown + r.refused, 0)
  assert.equal((await f.rows('select state from email_campaigns where id=$1', [id]))[0].state, 'paused')
})

test('legacy campaigns (no snapshot) and campaigns scheduled with tracking off keep sending whatever the provider says now', async t => {
  const f = await fixture(t)
  const legacy = await f.schedule('Sem registro', null)
  await f.reset()
  const p = f.provider(() => unknown())
  const r1 = await dispatchCampaigns(f.campaignDb, p, config)
  assert.equal(r1.accepted, 3); assert.equal((await f.rows('select state from email_campaigns where id=$1', [legacy]))[0].state, 'completed')
  const off = await f.schedule('Agendada sem rastreamento', verified(false))
  await f.reset()
  const q = f.provider(() => verified(true))
  const r2 = await dispatchCampaigns(f.campaignDb, q, config)
  assert.equal(r2.accepted, 3); assert.equal((await f.rows('select state from email_campaigns where id=$1', [off]))[0].state, 'completed')
  // Scheduling never upgrades the promise: a snapshot that said "off" still cannot be used for a resend.
  assert.equal((await f.rpc('ec_resend_preview', [actor, off])).allowed, false)
})

test('a resend pauses when open tracking is not confirmed now, even though it was confirmed at scheduling; origin stays intact', async t => {
  const f = await fixture(t)
  const origin = await f.schedule('Origem', verified(true))
  await f.reset()
  const p = f.provider(() => verified(true))
  assert.equal((await dispatchCampaigns(f.campaignDb, p, config)).accepted, 3)
  const old = new Date(Date.now() - 60 * 3600e3).toISOString()
  for (const r of await f.rows('select id,provider_id from email_campaign_recipients where campaign_id=$1', [origin])) await f.rpc('ec_event', ['d-' + r.id, r.provider_id, 'email.delivered', old])
  const originBefore = await f.snapshot(origin)
  const draft = (await f.rpc('ec_resend_create', [actor, origin])).campaign
  await f.rpc('ec_schedule', [actor, draft.id, new Date().toISOString(), forms, 3, JSON.stringify(verified(true))])
  await f.reset()
  const offNow = f.provider(() => verified(false))
  const r = await dispatchCampaigns(f.campaignDb, offNow, config)
  assert.deepEqual(offNow.sent, []); assert.equal(r.accepted, 0)
  assert.equal((await f.rows('select state,pause_reason from email_campaigns where id=$1', [draft.id]))[0].pause_reason, 'tracking_not_confirmed')
  assert.deepEqual(await f.snapshot(origin), originBefore)
  assert.ok((await f.rows("select state from email_campaign_recipients where campaign_id=$1", [draft.id])).every(x => x.state === 'pending'))
})

test('SQL tracking guard rejects a reading with missing status or a missing promised flag rather than yielding NULL', async t => {
  const f = await fixture(t)
  const promised = JSON.stringify(verified(true))
  for (const current of [{open:true,click:true}, {open:true,status:'verified'}, {click:true,status:'verified'}]) {
    assert.equal(await f.rpc('ec_tracking_still_confirmed', [promised, JSON.stringify(current)]), false)
  }
  const id = await f.schedule('Incomplete reading', verified(true))
  assert.equal(await f.rpc('ec_claim', [200, JSON.stringify({open:true,click:true})]), null)
  assert.equal((await f.rows('select state,pause_reason from email_campaigns where id=$1', [id]))[0].pause_reason, 'tracking_not_confirmed')
  assert.ok((await f.rows('select state from email_campaign_recipients where campaign_id=$1', [id])).every(r=>r.state==='pending'))
})
