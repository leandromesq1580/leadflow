// Loopback-only PostgreSQL verification; creates/drops its own isolated database.
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
 console.log(JSON.stringify({passed:true,cases:['parallel booking has 3 jobs','exclusive immediate claims','exclusive reminder claim']}))
}finally{
 await Promise.allSettled([a.end(),b.end()])
 await root.query(`DROP DATABASE IF EXISTS ${database}`)
 await root.end()
}
