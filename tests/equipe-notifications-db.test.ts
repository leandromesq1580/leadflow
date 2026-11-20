import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('reminder becomes due exactly 1h before, survives days, excludes cancelled/rescheduled/past',async()=>{
 const db=new PGlite()
 try {
  await db.exec(readFileSync('tests/equipe-booking-db.test.ts','utf8').match(/await db.exec\(`([\s\S]*?)`\)/)![1])
  await db.exec(`CREATE TABLE test_clock_value(t timestamptz); INSERT INTO test_clock_value VALUES ('2026-12-01T12:00:00Z'); CREATE FUNCTION test_clock() RETURNS timestamptz LANGUAGE SQL AS 'SELECT t FROM test_clock_value';`)
  await db.exec(readFileSync('supabase/migrations/080_equipe_notifications.sql','utf8').replaceAll('now()','public.test_clock()'))
  await db.exec(`INSERT INTO leads(name,email,phone,raw_data) VALUES ('Jane','test@example.test','+12025550123','{"source":"landing_equipe","requestId":"reminder-test","idioma":"en","fuso":"America/New_York"}'); INSERT INTO appointments(lead_id,buyer_id,scheduled_at,status) SELECT l.id,b.id,'2026-12-08T15:00:00Z','scheduled' FROM leads l CROSS JOIN buyers b;`)
  assert.equal((await db.query('SELECT * FROM equipe_notification_outbox')).rows.length,3)
  assert.equal((await db.query('SELECT * FROM equipe_claim_notifications()')).rows.length,2)
  await db.exec("UPDATE equipe_notification_outbox SET status='sent' WHERE status='sending'; UPDATE test_clock_value SET t='2026-12-08T13:59:59Z'")
  assert.equal((await db.query('SELECT * FROM equipe_claim_notifications()')).rows.length,0)
  await db.exec("UPDATE test_clock_value SET t='2026-12-08T14:00:00Z'")
  const due=await db.query<{kind:string}>('SELECT * FROM equipe_claim_notifications()')
  assert.equal(due.rows.length,1);assert.equal(due.rows[0].kind,'reminder')
  assert.equal((await db.query('SELECT * FROM equipe_claim_notifications()')).rows.length,0)
  await db.exec("UPDATE equipe_notification_outbox SET status='pending'; UPDATE appointments SET status='cancelled'")
  assert.equal((await db.query('SELECT * FROM equipe_claim_notifications()')).rows.length,0)
  await db.exec("UPDATE appointments SET status='scheduled',scheduled_at='2026-12-09T15:00:00Z'")
  const rescheduled=await db.query<{kind:string;scheduled_for:string}>('SELECT * FROM equipe_claim_notifications()')
  assert.ok(rescheduled.rows.every(r=>new Date(r.scheduled_for).toISOString()==='2026-12-09T15:00:00.000Z'))
  assert.equal(rescheduled.rows.length,2)
  await db.exec("UPDATE equipe_notification_outbox SET status='sent' WHERE status='sending'; UPDATE test_clock_value SET t='2026-12-09T15:00:00Z'")
  assert.equal((await db.query('SELECT * FROM equipe_claim_notifications()')).rows.length,0)
 }finally{await db.close()}
})

test('outbox is atomic, no historical backfill, exclusive claims, bounded safe retries and RLS',async()=>{
 const db=new PGlite()
 try {
  const fixture=readFileSync('tests/equipe-booking-db.test.ts','utf8').match(/await db.exec\(`([\s\S]*?)`\)/)![1]
  await db.exec(fixture)
  await db.exec(readFileSync('supabase/migrations/079_equipe_booking.sql','utf8'))
  const {rows:[{slot}]}=await db.query<{slot:string}>(`SELECT (date_trunc('week',now() AT TIME ZONE 'America/Sao_Paulo')+interval '7 days 9 hours') AT TIME ZONE 'America/Sao_Paulo' AS slot`)
  const p={nome:'Test Agent',email:'test@example.test',telefone:'+12025550123',idioma:'pt',fuso:'America/New_York',slot:new Date(slot).toISOString(),requestId:'a97687f0-d792-4b27-bd06-1ee41ccf44b9',tracking:{}}
  const book=(body:any)=>db.query('SELECT equipe_book($1::jsonb,$2::text)',[JSON.stringify(body),body.email])
  await book(p) // historical appointment before migration
  await db.exec(readFileSync('supabase/migrations/080_equipe_notifications.sql','utf8'))
  assert.equal((await db.query('SELECT * FROM equipe_notification_outbox')).rows.length,0)
  const next={...p,email:'next@example.test',telefone:'+12025550124',slot:new Date(Date.parse(p.slot)+3600000).toISOString(),requestId:'b97687f0-d792-4b27-bd06-1ee41ccf44b9'}
  await book(next);await book(next)
  assert.equal((await db.query('SELECT * FROM equipe_notification_outbox')).rows.length,3)
  assert.equal((await db.query('SELECT * FROM equipe_claim_notifications($1)',[p.requestId])).rows.length,0)
  const claimed=await db.query<{channel:string;status:string}>('SELECT * FROM equipe_claim_notifications($1)',[next.requestId])
  assert.equal(claimed.rows.length,2);assert.ok(claimed.rows.every(r=>r.status==='sending'))
  assert.equal((await db.query('SELECT * FROM equipe_claim_notifications()')).rows.length,0)
  await db.exec("UPDATE equipe_notification_outbox SET updated_at=now()-interval '6 minutes'")
  const retry=await db.query<{channel:string}>('SELECT * FROM equipe_claim_notifications()')
  assert.deepEqual(retry.rows.map(r=>r.channel),['email'])
  assert.equal((await db.query<{status:string}>("SELECT status FROM equipe_notification_outbox WHERE channel='whatsapp'")).rows[0].status,'unknown')
  await db.exec("UPDATE equipe_notification_outbox SET first_attempt_at=now()-interval '24 hours',updated_at=now()-interval '6 minutes'")
  assert.equal((await db.query('SELECT * FROM equipe_claim_notifications()')).rows.length,0)
  await db.exec('DELETE FROM pipeline_stages')
  await assert.rejects(book({...next,email:'rollback@example.test',telefone:'+12025550125',requestId:'c97687f0-d792-4b27-bd06-1ee41ccf44b9',slot:new Date(Date.parse(p.slot)+7200000).toISOString()}),/unavailable/)
  assert.equal((await db.query('SELECT * FROM equipe_notification_outbox')).rows.length,3)
  const {rows:[priv]}=await db.query<{table_ok:boolean;rpc_ok:boolean}>(`SELECT has_table_privilege('anon','equipe_notification_outbox','SELECT') table_ok,has_function_privilege('anon','equipe_claim_notifications(text)','EXECUTE') rpc_ok`)
  assert.deepEqual(priv,{table_ok:false,rpc_ok:false})
 } finally {await db.close()}
})
