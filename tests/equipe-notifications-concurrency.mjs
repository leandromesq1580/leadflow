// Loopback-only PostgreSQL verification; retains its isolated database as evidence.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(process.env.EQUIPE_TEST_DEPS?`${process.env.EQUIPE_TEST_DEPS}/package.json`:import.meta.url)
const {Client}=require('pg')
const config={host:'127.0.0.1',port:55437,user:'hermes'}
const database=`equipe_notice_${process.pid}`
const root=new Client({...config,database:'postgres'})
await root.connect()
const a=new Client({...config,database}), b=new Client({...config,database})
try {
 await root.query(`CREATE DATABASE ${database}`)
 await Promise.all([a.connect(),b.connect()])
 const fixture=readFileSync('tests/equipe-booking-db.test.ts','utf8').match(/await db.exec\(`([\s\S]*?)`\)/)[1]
 for(const role of ['anon','authenticated','service_role']) {
  if(!(await root.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)await root.query(`CREATE ROLE ${role}`)
 }
 await a.query(fixture.replace(/CREATE ROLE (anon|authenticated|service_role);/g,''))
 await a.query(readFileSync('supabase/migrations/079_equipe_booking.sql','utf8'))
 await a.query(readFileSync('supabase/migrations/080_equipe_notifications.sql','utf8'))
 const {rows:[{slot}]}=await a.query(`SELECT (date_trunc('week',now() AT TIME ZONE 'America/Sao_Paulo')+interval '7 days 9 hours') AT TIME ZONE 'America/Sao_Paulo' AS slot`)
 const payload={nome:'Local Test',email:'test@example.test',telefone:'+12025550123',idioma:'en',fuso:'America/New_York',slot:slot.toISOString(),requestId:'a97687f0-d792-4b27-bd06-000000000001',tracking:{}}
 const book=c=>c.query('SELECT equipe_book($1::jsonb,$2::text)',[JSON.stringify(payload),'local-only'])
 const results=await Promise.all([book(a),book(b)])
 assert.ok(results.every(r=>r.rows[0].equipe_book.ok))
 assert.equal((await a.query('SELECT * FROM equipe_notification_outbox')).rowCount,3)
 // A holds the claim locks; B must SKIP LOCKED without duplicating either job.
 await a.query('BEGIN')
 assert.equal((await a.query('SELECT * FROM equipe_claim_notifications()')).rowCount,2)
 assert.equal((await b.query('SELECT * FROM equipe_claim_notifications()')).rowCount,0)
 await a.query('COMMIT')
 await a.query("UPDATE equipe_notification_outbox SET status='sent' WHERE status='sending'; UPDATE equipe_notification_outbox SET next_attempt_at=now() WHERE kind='reminder'")
 // Force only the due timestamp for concurrency; controlled clock boundary is in DB tests.
 await a.query('BEGIN')
 assert.equal((await a.query('SELECT * FROM equipe_claim_notifications()')).rowCount,1)
 assert.equal((await b.query('SELECT * FROM equipe_claim_notifications()')).rowCount,0)
 await a.query('COMMIT')
 const cases=['parallel booking has 3 jobs','exclusive immediate claims','exclusive reminder claim']
 const slotA=new Date(slot.getTime()+2*60*60*1000),slotB=new Date(slot.getTime()+3*60*60*1000)
 const {rows:[appointment]}=await a.query("INSERT INTO appointments(lead_id,buyer_id,scheduled_at,status) SELECT lead_id,buyer_id,$1,'scheduled' FROM appointments LIMIT 1 RETURNING id",[slotA])
 const move=(client,at)=>client.query('UPDATE appointments SET scheduled_at=$1 WHERE id=$2',[at,appointment.id])
 const reminder=()=>a.query("SELECT * FROM equipe_notification_outbox WHERE appointment_id=$1 AND kind='reminder' AND scheduled_for=$2",[appointment.id,slotA])
 await move(a,slotB);await move(a,slotA)
 const original=(await reminder()).rows[0]
 assert.equal(original.status,'pending');assert.equal(original.attempts,0);assert.equal(original.first_attempt_at,null)
 await a.query("UPDATE equipe_notification_outbox SET status='sent' WHERE kind='confirmation'")
 await a.query("UPDATE equipe_notification_outbox SET next_attempt_at=now() WHERE id=$1",[original.id])
 await a.query('BEGIN')
 assert.equal((await a.query('SELECT * FROM equipe_claim_notifications()')).rows[0].id,original.id)
 assert.equal((await b.query('SELECT * FROM equipe_claim_notifications()')).rowCount,0)
 // A real attempted claim wins before rescheduling; observe B blocked, not just a sleep.
 const moveBlocked=move(b,slotB)
 let blocked=false
 for(let i=0;i<100;i++){
  const r=await root.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked',[b.processID])
  if(r.rows[0].blocked){blocked=true;break}
  await new Promise(r=>setTimeout(r,10))
 }
 assert.ok(blocked,'reschedule waits for uncommitted claim')
 await a.query('COMMIT');await moveBlocked;await move(a,slotA)
 const attempted=(await reminder()).rows[0]
 assert.equal(attempted.id,original.id);assert.equal(attempted.status,'sending');assert.equal(attempted.attempts,1)
 assert.ok(attempted.first_attempt_at);assert.equal(attempted.invalidated_by_reschedule,false)
 cases.push('restored reminder has one exclusive claim','claim first: reschedule waits and never resets attempt')
 // A separate never-attempted reminder: reschedule holds locks before the worker.
 const slotC=new Date(slot.getTime()+4*60*60*1000),slotD=new Date(slot.getTime()+5*60*60*1000)
 const {rows:[other]}=await a.query("INSERT INTO appointments(lead_id,buyer_id,scheduled_at,status) SELECT lead_id,buyer_id,$1,'scheduled' FROM appointments LIMIT 1 RETURNING id",[slotC])
 await a.query("UPDATE equipe_notification_outbox SET status='sent' WHERE kind='confirmation'")
 await a.query("UPDATE equipe_notification_outbox SET next_attempt_at=now() WHERE appointment_id=$1 AND kind='reminder'",[other.id])
 await a.query('BEGIN')
 await a.query('UPDATE appointments SET scheduled_at=$1 WHERE id=$2',[slotD,other.id])
 assert.equal((await b.query('SELECT * FROM equipe_claim_notifications()')).rowCount,0)
 await a.query('UPDATE appointments SET scheduled_at=$1 WHERE id=$2',[slotC,other.id])
 await a.query("UPDATE equipe_notification_outbox SET next_attempt_at=now() WHERE appointment_id=$1 AND scheduled_for=$2 AND kind='reminder'",[other.id,slotC])
 assert.equal((await b.query('SELECT * FROM equipe_claim_notifications()')).rowCount,0)
 await a.query('COMMIT')
 await a.query("UPDATE equipe_notification_outbox SET status='sent' WHERE kind='confirmation'")
 const after=await b.query('SELECT * FROM equipe_claim_notifications()')
 assert.equal(after.rowCount,1);assert.equal(after.rows[0].appointment_id,other.id);assert.equal(after.rows[0].attempts,1)
 assert.equal((await a.query('SELECT * FROM equipe_claim_notifications()')).rowCount,0)
 cases.push('reschedule first: worker skips until commit, then claims once')
 console.log(JSON.stringify({passed:true,cases}))
}finally{
 await Promise.allSettled([a.end(),b.end()])
 // The caller stops its own disposable cluster; no destructive SQL cleanup.
 await root.end()
}
