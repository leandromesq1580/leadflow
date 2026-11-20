import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('reschedule recovery requires provenance, zero attempts, null first attempt; cancellation is terminal',async()=>{
 const db=new PGlite()
 try {
  await db.exec(readFileSync('tests/equipe-booking-db.test.ts','utf8').match(/await db.exec\(`([\s\S]*?)`\)/)![1])
  await db.exec(`CREATE TABLE test_clock_value(t timestamptz); INSERT INTO test_clock_value VALUES ('2026-12-01T12:00:00Z'); CREATE FUNCTION test_clock() RETURNS timestamptz LANGUAGE SQL AS 'SELECT t FROM test_clock_value';`)
  await db.exec(readFileSync('supabase/migrations/080_equipe_notifications.sql','utf8').replaceAll('now()','public.test_clock()'))
  await db.exec(`INSERT INTO leads(name,email,phone,raw_data) VALUES ('Synthetic','test@example.test','+12025550123','{"source":"landing_equipe","requestId":"guards","idioma":"en","fuso":"UTC"}'); INSERT INTO appointments(lead_id,buyer_id,scheduled_at,status) SELECT l.id,b.id,'2026-12-08T15:00:00Z','scheduled' FROM leads l CROSS JOIN buyers b;`)
  const cases=[
   {name:'sent',setup:"UPDATE equipe_notification_outbox SET status='sent'",status:'sent'},
   {name:'unknown',setup:"UPDATE equipe_notification_outbox SET status='unknown'",status:'unknown'},
   {name:'sending zero attempts',setup:"UPDATE equipe_notification_outbox SET status='sending'",status:'sending'},
   {name:'unrelated failure',setup:"UPDATE equipe_notification_outbox SET status='failed'",status:'failed'},
   {name:'attempt counter alone',setup:"UPDATE equipe_notification_outbox SET attempts=1",status:'failed'},
   {name:'timestamp alone',setup:"UPDATE equipe_notification_outbox SET first_attempt_at=public.test_clock()",status:'failed'},
   {name:'TTL expired',setup:"UPDATE equipe_notification_outbox SET attempts=1,first_attempt_at=public.test_clock()-interval '24 hours',updated_at=public.test_clock()-interval '6 minutes'; SELECT * FROM equipe_claim_notifications()",status:'failed'},
   {name:'cancel then reschedule',setup:"UPDATE appointments SET status='cancelled'",status:'failed'},
   {name:'reschedule then cancel',setup:"UPDATE appointments SET scheduled_at='2026-12-10T15:00:00Z'; UPDATE appointments SET status='cancelled'",status:'failed'},
   {name:'complete then reschedule',setup:"UPDATE appointments SET status='completed'",status:'failed'},
  ]
  for(const c of cases){
   await db.exec('BEGIN')
   await db.exec(c.setup)
   await db.exec("UPDATE appointments SET status='scheduled',scheduled_at='2026-12-09T15:00:00Z'; UPDATE appointments SET scheduled_at='2026-12-08T15:00:00Z'")
   const rows=(await db.query<{status:string;invalidated_by_reschedule:boolean}>("SELECT status,invalidated_by_reschedule FROM equipe_notification_outbox WHERE scheduled_for='2026-12-08T15:00:00Z'")).rows
   assert.equal(rows.length,3,c.name)
   assert.ok(rows.every(r=>r.status===c.status && !r.invalidated_by_reschedule),c.name)
   await db.exec('ROLLBACK')
  }
  // Rechecking the recovery guard is mandatory even if the provenance bit exists.
  for(const mutation of ["attempts=1","first_attempt_at=public.test_clock()","status='sent'","status='unknown'","status='sending'"]){
   await db.exec('BEGIN')
   await db.exec("UPDATE appointments SET scheduled_at='2026-12-09T15:00:00Z'")
   await db.exec(`UPDATE equipe_notification_outbox SET ${mutation} WHERE kind='reminder' AND scheduled_for='2026-12-08T15:00:00Z'`)
   await db.exec("UPDATE appointments SET scheduled_at='2026-12-08T15:00:00Z'")
   const r=(await db.query<{status:string}>("SELECT status FROM equipe_notification_outbox WHERE kind='reminder' AND scheduled_for='2026-12-08T15:00:00Z'")).rows[0]
   assert.notEqual(r.status,'pending',mutation)
   await db.exec('ROLLBACK')
  }
  // Repeated round trips keep the same identity, never reopen confirmation/WA.
  await db.exec("UPDATE appointments SET scheduled_at='2026-12-09T15:00:00Z'; UPDATE appointments SET scheduled_at='2026-12-10T15:00:00Z'; UPDATE appointments SET scheduled_at='2026-12-08T15:00:00Z'; UPDATE appointments SET scheduled_at='2026-12-09T15:00:00Z'; UPDATE appointments SET scheduled_at='2026-12-08T15:00:00Z'")
  const rows=(await db.query<{kind:string;status:string;attempts:number}>("SELECT kind,status,attempts FROM equipe_notification_outbox WHERE scheduled_for='2026-12-08T15:00:00Z'")).rows
  assert.equal(rows.length,3)
  assert.ok(rows.every(r=>r.status===(r.kind==='reminder'?'pending':'failed') && r.attempts===0))
 }finally{await db.close()}
})
