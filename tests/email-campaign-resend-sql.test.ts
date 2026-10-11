import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { META_FORM_LANGUAGES } from '../src/lib/lead-language'
// Synthetic fixtures only (example.invalid). Covers migration 063: tracking snapshot, engagement filter, safe resend.
const actor = '00000000-0000-0000-0000-000000000001'
const client = '00000000-0000-0000-0000-000000000002'
const forms = JSON.stringify(META_FORM_LANGUAGES)
const tracking = (open: boolean | null, click: boolean | null = open) => JSON.stringify({ open, click, status: open === null ? 'unknown' : 'verified', checked_at: new Date().toISOString() })
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgreSQL JSON fixtures exercise several RPC envelopes; assertions validate their concrete fields.
type Json = Record<string, any>
async function fixture(t: TestContext) {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table buyers(id uuid primary key, is_admin boolean, name text);
    create table leads(id uuid primary key default gen_random_uuid(),name text,email text,state text,type text default 'hot',assigned_to uuid,lead_language text,form_name text,created_at timestamptz default now());
    insert into buyers(id,is_admin) values ('${actor}',true),('${client}',false);
    insert into leads(name,email,state,lead_language,assigned_to) values ('A','a@example.invalid','FL','pt','${client}'),('B','b@example.invalid','FL','pt',null),('C','c@example.invalid','NH','es',null),('D','d@example.invalid','FL','pt',null),('E','e@example.invalid','FL','pt',null);`)
  for (const m of ['062_admin_email_campaigns.sql', '063_email_campaign_tracking_resend.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/' + m, import.meta.url), 'utf8'))
  const rpc = async (name: string, args: unknown[] = []) => (await db.query<{ r: Json }>(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args)).rows[0].r
  await rpc('ec_record_permission', [actor, '{}', forms, 'Synthetic documented insurance consent fixture', true])
  const campaign = async () => rpc('ec_save', [actor, null, JSON.stringify({ name: 'Origem', subject_pt: 'Olá {{nome}}', body_pt: 'Seguro.', subject_es: 'Hola {{nome}}', body_es: 'Seguro.', filters: {} })])
  // Runs the whole origin: schedule, claim+authorize+finish every recipient, with provider ids.
  const processed = async (track: string | null) => {
    const c = await campaign()
    await rpc('ec_schedule', [actor, c.id, new Date().toISOString(), forms, null, track])
    await db.exec("update email_campaign_rate set minute_used=0,day_used=0")
    for (let i = 0; i < 5; i++) {
      const r = await rpc('ec_claim', [200, track]); if (!r) break  // the worker passes its current provider reading; here it equals the snapshot
      assert.equal(await rpc('ec_authorize', [r.id, r.lease]), true)
      await rpc('ec_finish', [r.id, r.lease, 'accepted', 'prov-' + c.id.slice(0, 8) + '-' + i, null])
    }
    return c
  }
  const rows = async (sql: string, args: unknown[] = []) => (await db.query<Json>(sql, args)).rows
  return { db, rpc, campaign, processed, rows }
}

test('scheduling persists the tracking snapshot; ec_list exposes it, unopened counts and exact filtered totals', async t => {
  const { rpc, processed, db, rows } = await fixture(t)
  const c = await processed(tracking(true))
  const list = await rpc('ec_list', [actor, c.id, 0])
  assert.equal(list.campaigns[0].tracking_snapshot.open, true)
  assert.equal(list.campaigns[0].stats.accepted, 5)
  // Deliver 4 (one stays only accepted), open 1, click 1 (click without open still counts as engaged)
  const ids = (await rows("select id,provider_id from email_campaign_recipients where campaign_id=$1 order by id", [c.id]))
  const at = new Date(Date.now() - 50 * 3600 * 1000).toISOString()
  for (const r of ids.slice(0, 4)) await rpc('ec_event', ['d-' + r.id, r.provider_id, 'email.delivered', at])
  await rpc('ec_event', ['o-1', ids[0].provider_id, 'email.opened', new Date().toISOString()])
  await rpc('ec_event', ['k-1', ids[1].provider_id, 'email.clicked', new Date().toISOString()])
  const s = (await rpc('ec_list', [actor, c.id, 0])).campaigns[0].stats
  assert.equal(s.delivered, 4); assert.equal(s.opened, 1); assert.equal(s.clicked, 1); assert.equal(s.unopened, 2); assert.equal(s.accepted, 5)
  const unopened = await rpc('ec_list', [actor, c.id, 0, 'unopened'])
  assert.equal(unopened.total_recipients, 2); assert.equal(unopened.recipients.length, 2)
  assert.ok(unopened.recipients.every((r: Json) => r.delivered_at && !r.opened_at && !r.clicked_at))
  const clicked = await rpc('ec_list', [actor, c.id, 0, 'clicked'])
  assert.equal(clicked.total_recipients, 1); assert.equal(clicked.recipients[0].id, ids[1].id)
  assert.equal((await rpc('ec_list', [actor, c.id, 0, 'accepted'])).total_recipients, 1)
  assert.equal((await rpc('ec_list', [actor, c.id, 0])).total_recipients, 5, 'no filter keeps the full list')
  await assert.rejects(rpc('ec_list', [actor, c.id, 0, 'everything']), /invalid_engagement/)
  assert.ok(db)
})

test('older campaigns without snapshot or with tracking off cannot be used for a resend (no retroactive inference)', async t => {
  const { rpc, processed, rows } = await fixture(t)
  for (const [track, reason] of [[null, 'tracking_unconfirmed'], [tracking(false), 'tracking_unconfirmed'], [tracking(null), 'tracking_unconfirmed']] as const) {
    const c = await processed(track)
    const ids = await rows("select provider_id from email_campaign_recipients where campaign_id=$1", [c.id])
    for (const r of ids) await rpc('ec_event', ['d-' + r.provider_id, r.provider_id, 'email.delivered', new Date(Date.now() - 72 * 3600e3).toISOString()])
    const p = await rpc('ec_resend_preview', [actor, c.id])
    assert.equal(p.allowed, false); assert.equal(p.reason, reason); assert.equal(p.eligible, 0)
    await assert.rejects(rpc('ec_resend_create', [actor, c.id]), /tracking_unconfirmed/)
  }
  assert.equal((await rpc('ec_list', [actor, null, 0])).campaigns.every((c: Json) => c.resend_of === null), true)
})

test('resend audience: delivered >=48h, no open, no click, not blocked; preview explains every exclusion', async t => {
  const { rpc, processed, rows, db } = await fixture(t)
  const c = await processed(tracking(true))
  const ids = await rows("select id,provider_id,email from email_campaign_recipients where campaign_id=$1 order by id", [c.id])
  const old = new Date(Date.now() - 49 * 3600e3).toISOString(), recent = new Date(Date.now() - 47 * 3600e3).toISOString()
  // 0: eligible · 1: opened · 2: clicked only · 3: delivered too recently · 4: never delivered (accepted only)
  for (const r of ids.slice(0, 3)) await rpc('ec_event', ['d-' + r.id, r.provider_id, 'email.delivered', old])
  await rpc('ec_event', ['d-3', ids[3].provider_id, 'email.delivered', recent])
  await rpc('ec_event', ['o-1', ids[1].provider_id, 'email.opened', old])
  await rpc('ec_event', ['k-2', ids[2].provider_id, 'email.clicked', old])
  const p = await rpc('ec_resend_preview', [actor, c.id])
  assert.equal(p.allowed, true); assert.equal(p.eligible, 1); assert.equal(p.pt + p.es, 1)
  assert.equal(p.exclusions.opened, 1); assert.equal(p.exclusions.clicked, 1); assert.equal(p.exclusions.too_recent, 1); assert.equal(p.exclusions.not_delivered, 1)
  // Suppression after delivery removes the last eligible contact.
  await db.query("update email_campaign_contacts set suppressed_at=now() where email=$1", [ids[0].email])
  const blocked = await rpc('ec_resend_preview', [actor, c.id])
  assert.equal(blocked.eligible, 0); assert.equal(blocked.exclusions.blocked, 1)
  await assert.rejects(rpc('ec_resend_preview', [client, c.id]), /admin_required/)
})

test('resend is a linked draft, created once, never scheduled automatically, never touching the origin rows', async t => {
  const { rpc, processed, rows } = await fixture(t)
  const c = await processed(tracking(true))
  const ids = await rows("select id,provider_id from email_campaign_recipients where campaign_id=$1 order by id", [c.id])
  const old = new Date(Date.now() - 60 * 3600e3).toISOString()
  for (const r of ids) await rpc('ec_event', ['d-' + r.id, r.provider_id, 'email.delivered', old])
  await rpc('ec_event', ['o-0', ids[0].provider_id, 'email.opened', old])
  const before = await rows("select id,state,provider_id,accepted_at,delivered_at,opened_at from email_campaign_recipients where campaign_id=$1 order by id", [c.id])
  const first = await rpc('ec_resend_create', [actor, c.id])
  assert.equal(first.existing, false); assert.equal(first.campaign.state, 'draft'); assert.equal(first.campaign.resend_of, c.id)
  assert.match(first.campaign.name, /Origem/)
  const again = await rpc('ec_resend_create', [actor, c.id])
  assert.equal(again.existing, true); assert.equal(again.campaign.id, first.campaign.id)
  assert.equal((await rows("select count(*)::int n from email_campaigns where resend_of=$1", [c.id]))[0].n, 1)
  assert.equal((await rows("select count(*)::int n from email_campaign_recipients where campaign_id=$1", [first.campaign.id]))[0].n, 0, 'draft has no queue')
  assert.deepEqual(await rows("select id,state,provider_id,accepted_at,delivered_at,opened_at from email_campaign_recipients where campaign_id=$1 order by id", [c.id]), before)
  assert.equal((await rows("select count(*)::int n from email_campaign_audit where action='resend_prepared' and campaign_id=$1", [first.campaign.id]))[0].n, 1)
  // A resend of a resend is refused, and the unique index enforces one round even under a direct insert race.
  await assert.rejects(rpc('ec_resend_preview', [actor, first.campaign.id]).then((p: Json) => { if (!p.allowed && p.reason === 'resend_of_resend') throw new Error(p.reason) }), /resend_of_resend/)
  await assert.rejects(rpc('ec_resend_create', [actor, first.campaign.id]), /resend_of_resend/)
  await assert.rejects(rows("insert into email_campaigns(name,subject_pt,body_pt,subject_es,body_es,resend_of) values('x','x','x','x','x',$1)", [c.id]), /email_campaign_resend_once|duplicate key/)
  const list = await rpc('ec_list', [actor, c.id, 0])
  assert.equal(list.campaigns[0].resend_id, first.campaign.id)
  assert.equal((await rpc('ec_list', [actor, first.campaign.id, 0])).campaigns[0].origin_name, 'Origem')
})

test('scheduling a resend freezes the original recipients, requires tracking, re-checks engagement before each send', async t => {
  const { rpc, processed, rows, db } = await fixture(t)
  const c = await processed(tracking(true))
  const ids = await rows("select id,provider_id,email,lead_id,language from email_campaign_recipients where campaign_id=$1 order by id", [c.id])
  const old = new Date(Date.now() - 60 * 3600e3).toISOString()
  for (const r of ids) await rpc('ec_event', ['d-' + r.id, r.provider_id, 'email.delivered', old])
  await rpc('ec_event', ['o-0', ids[0].provider_id, 'email.opened', old])
  // New lead registering after the origin must NOT be pulled in by the generic audience.
  await db.exec("insert into leads(name,email,state,lead_language) values('New','new@example.invalid','FL','pt')")
  await rpc('ec_record_permission', [actor, '{}', forms, 'Synthetic documented insurance consent fixture', true])
  const draft = (await rpc('ec_resend_create', [actor, c.id])).campaign
  await assert.rejects(rpc('ec_schedule', [actor, draft.id, new Date().toISOString(), forms, 4, tracking(false)]), /tracking_unconfirmed/)
  await assert.rejects(rpc('ec_schedule', [actor, draft.id, new Date().toISOString(), forms, 4, null]), /tracking_unconfirmed/)
  // Someone clicks between preview and schedule: expected count no longer matches.
  await rpc('ec_event', ['k-1', ids[1].provider_id, 'email.clicked', new Date().toISOString()])
  await assert.rejects(rpc('ec_schedule', [actor, draft.id, new Date().toISOString(), forms, 4, tracking(true)]), /audience_changed/)
  const scheduled = await rpc('ec_schedule', [actor, draft.id, new Date().toISOString(), forms, 3, tracking(true)])
  assert.equal(scheduled.state, 'scheduled'); assert.equal(scheduled.audience_snapshot.eligible, 3)
  const queued = await rows("select email,lead_id,language,state from email_campaign_recipients where campaign_id=$1 order by email", [draft.id])
  assert.deepEqual(queued.map(q => q.email), ids.slice(2).map(r => r.email).sort())
  assert.ok(queued.every(q => q.state === 'pending' && q.lead_id && ['pt', 'es'].includes(q.language)))
  assert.ok(!queued.some(q => q.email === 'new@example.invalid'))
  // Origin untouched after scheduling the resend
  assert.equal((await rows("select count(*)::int n from email_campaign_recipients where campaign_id=$1 and provider_id is not null and state='delivered'", [c.id]))[0].n, 5)
  // Engagement arriving after scheduling: the sweep and the final authorization both stop the send.
  await rpc('ec_event', ['o-2', ids[2].provider_id, 'email.opened', new Date().toISOString()])
  await db.exec("update email_campaign_rate set minute_used=0,day_used=0")
  const a = await rpc('ec_claim', [200, tracking(true)])
  assert.notEqual(a.email, ids[2].email, 'opened contact must be removed by the pending sweep')
  assert.equal((await rows("select state,reason from email_campaign_recipients where campaign_id=$1 and email=$2", [draft.id, ids[2].email]))[0].reason, 'engaged_before_resend')
  await rpc('ec_event', ['k-' + a.email, (ids.find(r => r.email === a.email) as Json).provider_id, 'email.clicked', new Date().toISOString()])
  assert.equal(await rpc('ec_authorize', [a.id, a.lease]), false)
  assert.equal((await rows("select state from email_campaign_recipients where id=$1", [a.id]))[0].state, 'suppressed')
  const b = await rpc('ec_claim', [200, tracking(true)])
  assert.equal(await rpc('ec_authorize', [b.id, b.lease]), true)
  assert.equal(await rpc('ec_claim', [200, tracking(true)]), null, 'the resend never grows beyond the frozen eligible set')
})

test('new SQL objects are not executable by anon/authenticated and search_path is fixed', async t => {
  const { db } = await fixture(t)
  const fns = await db.query<{ proname: string; proconfig: string[] | null; acl: string | null }>("select proname,proconfig,proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('ec_resend_preview','ec_resend_create','ec_resend_rows','ec_resend_engaged','ec_engagement_match','ec_tracking_confirmed','ec_tracking_still_confirmed','ec_control','ec_list','ec_schedule','ec_authorize','ec_claim')")
  assert.equal(fns.rows.length, 12, 'one signature each: the old ec_claim(integer) is dropped, not duplicated')
  for (const f of fns.rows) { assert.ok(f.proconfig?.some(x => x.startsWith('search_path=')), f.proname); assert.ok(!/[{,]=X\/|anon|authenticated/.test(String(f.acl)), f.proname + ' ' + f.acl) }
  await db.exec('set role authenticated')
  await assert.rejects(db.query(`select public.ec_resend_preview('${actor}','${actor}')`), /permission denied/)
})
