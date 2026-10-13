// Opt-in real PostgreSQL schema/triggers. Local socket only; no network/provider.
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const host = process.env.EC_TEST_SOCKET
if (!host?.startsWith('/')) throw new Error('Local Unix socket required')
const { Client } = createRequire((process.env.EC_TEST_TOOL_DIR || process.cwd()) + '/package.json')('pg')
const clients = []
async function connect(database = 'postgres') {
  const c = new Client({ host, port: 55432, user: process.env.USER || 'hermes', database, statement_timeout: 15000 })
  await c.connect(); clients.push(c); return c
}
const ctl = await connect(), database = 'seq_window_trigger_' + randomUUID().replaceAll('-', '')
await ctl.query('CREATE DATABASE ' + database)
const db = await connect(database), blocker = await connect(database), admin = await connect(database)
const read = file => readFileSync('supabase/migrations/' + file, 'utf8')
const migration = '067_sequence_window_preserve_enrollments.sql'
const checks = []
try {
  for (const role of ['anon', 'authenticated', 'service_role']) if (!(await ctl.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) await ctl.query('CREATE ROLE ' + role)
  const source = readFileSync('tests/sequence-reply-stage-sql.test.cjs', 'utf8')
  const schema = source.match(/await db\.exec\(`([\s\S]*?)`\)/)[1].replace(/CREATE ROLE (?:anon|authenticated|service_role);/g, '')
  await db.query(schema)
  await db.query(read('004_kanban_crm.sql').split('-- 4. Follow-ups')[0])
  await db.query(read('006_inbox_sequences_ai_push.sql').split('-- AI LEAD SCORING')[0])
  for (const name of ['052_ai_sequences_until_reply.sql', '053_ai_suppression_resolution.sql', '054_sequence_batch_pacing.sql',
    '055_sequence_batch_completion_clock.sql', '056_sequence_reply_stage.sql', '058_sequence_proven_rejection.sql', '060_sequence_six_per_fifteen.sql']) await db.query(read(name))
  if (existsSync('supabase/migrations/' + migration)) await db.query(read(migration))
  const buyer = randomUUID(); await db.query('insert into buyers(id) values($1)', [buyer])
  async function setup(status = 'paused', unknown = true) {
    const lead = randomUUID(), seq = randomUUID()
    const config = { timezone: 'America/New_York', days: [1, 2, 3, 4, 5], start: '09:00', end: '21:00', repeat_minutes: 480,
      stop_on_stage_exit: false, instructions: 'Keep \"quotes\" & (parentheses), future', future: { a: 1 } }
    await db.query('insert into leads(id,assigned_to) values($1,$2)', [lead, buyer])
    await db.query("insert into sequences(id,buyer_id,name,enabled,mode,ai_config) values($1,$2,'Synthetic',true,'ai_until_reply',$3)", [seq, buyer, config])
    const e = (await db.query('select * from enroll_sequence($1,$2,$3,now())', [buyer, seq, lead])).rows[0]
    if (unknown) await db.query("insert into ai_sequence_suppressions(buyer_id,lead_id,reason) values($1,$2,'delivery_unknown')", [buyer, lead])
    await db.query('update sequence_enrollments set status=$2,delivery_status=$3,stop_reason=$4,next_run_at=$5 where id=$1',
      [e.id, status, unknown ? 'unknown' : 'idle', unknown ? 'delivery_unknown' : null, '2026-10-14T13:00:00Z'])
    return { lead, seq, config, e: (await db.query('select to_jsonb(e) value from sequence_enrollments e where id=$1', [e.id])).rows[0].value }
  }
  for (const status of ['paused', 'active', 'stopped', 'completed']) {
    const x = await setup(status, status !== 'active')
    const s = (await db.query('select * from sequences where id=$1', [x.seq])).rows[0]
    await db.query('update sequences set ai_config=$2,updated_at=now() where id=$1', [x.seq, { ...x.config, start: '08:00' }])
    const after = (await db.query('select to_jsonb(e) value from sequence_enrollments e where id=$1', [x.e.id])).rows[0].value
    assert.deepEqual(after, x.e, 'window-only edit preserves entire ' + status + ' enrollment, including delivery_unknown')
    const changed = (await db.query('select * from sequences where id=$1', [x.seq])).rows[0]
    assert.deepEqual(changed.ai_config, { ...x.config, start: '08:00' })
    assert.equal(Number(changed.reply_move_version), Number(s.reply_move_version) + 1, 'retain reply-version safety fence')
    checks.push(status + '-preserved'); console.log('PASS actual schema preserves all enrollment fields: ' + status)
  }
  for (const change of ['enabled', 'instructions', 'repeat_minutes', 'buyer_id']) {
    const x = await setup()
    if (change === 'enabled') await db.query('update sequences set ai_config=$2,enabled=false where id=$1', [x.seq, { ...x.config, start: '08:00' }])
    else if (change === 'buyer_id') {
      const owner = randomUUID(); await db.query('insert into buyers(id) values($1)', [owner])
      await db.query('update sequences set ai_config=$2,buyer_id=$3 where id=$1', [x.seq, { ...x.config, start: '08:00' }, owner])
    } else await db.query('update sequences set ai_config=$2 where id=$1', [x.seq, { ...x.config, start: '08:00', [change]: change === 'repeat_minutes' ? 60 : 'new' }])
    assert.equal((await db.query('select status from sequence_enrollments where id=$1', [x.e.id])).rows[0].status, 'stopped', change + ' still rechecks')
    checks.push(change + '-rechecks'); console.log('PASS existing cancellation preserved: ' + change)
  }
  const x = await setup('active', false)
  await db.query('update sequences set ai_config=$2 where id=$1', [x.seq, { ...x.config, start: '08:00' }])
  await db.query("insert into sms_messages(lead_id,direction,body) values($1,'in','STOP')", [x.lead])
  assert.equal((await db.query('select stop_reason from sequence_enrollments where id=$1', [x.e.id])).rows[0].stop_reason, 'optout')
  checks.push('optout-retained'); console.log('PASS inbound STOP retains cancellation after window edit')
  const held = await setup()
  await blocker.query('begin'); await blocker.query('select id from sequence_enrollments where id=$1 for update', [held.e.id])
  try {
    await admin.query("set lock_timeout='1s'")
    await admin.query('update sequences set ai_config=$2,updated_at=now() where id=$1', [held.seq, { ...held.config, start: '08:00' }])
  } finally { await blocker.query('rollback') }
  checks.push('no-enrollment-lock'); console.log('PASS window-only edit does not acquire enrollment lock')
  for (const role of ['anon', 'authenticated', 'service_role']) assert.equal((await db.query("select has_function_privilege($1,'public.admin_sequence_window_ready()','execute') ok", [role])).rows[0].ok, role === 'service_role')
  assert.equal((await db.query('select public.admin_sequence_window_ready() ok')).rows[0].ok, true)
  checks.push('service-only-readiness')
  console.log(JSON.stringify({ checked_at: new Date().toISOString(), source: 'real-local-postgresql-with-versioned-triggers', checks: checks.length,
    database, production_writes: 0, provider_send_calls: 0 }))
} finally { for (const c of clients) { try { await c.query('rollback') } catch {} await c.end() } }
