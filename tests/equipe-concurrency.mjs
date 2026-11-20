// Local PostgreSQL only: connection intentionally hard-coded to loopback.
// Use a fresh equipe_test database; never run against production.
// node tests/equipe-concurrency.mjs (pg dependency may live in EQUIPE_TEST_DEPS)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(process.env.EQUIPE_TEST_DEPS ? `${process.env.EQUIPE_TEST_DEPS}/package.json` : import.meta.url)
const {Client} = require('pg')
const config = {host:'127.0.0.1',port:55437,user:'hermes',database:'equipe_test'}
const admin = new Client(config), a=new Client(config), b=new Client(config)
await Promise.all([admin.connect(),a.connect(),b.connect()])
try {
 // Reuse the exact isolated schema fixture from the unit test, not production.
 const fixture = readFileSync('tests/equipe-booking-db.test.ts','utf8').match(/await db.exec\(`([\s\S]*?)`\)/)[1]
 await admin.query(fixture)
 await admin.query(readFileSync('supabase/migrations/079_equipe_booking.sql','utf8'))
 const {rows:[{slot}]}=await admin.query(`SELECT (date_trunc('week',now() AT TIME ZONE 'America/Sao_Paulo')+interval '7 days 9 hours') AT TIME ZONE 'America/Sao_Paulo' AS slot`)
 let seq=0
 const payload=(offset=0)=>({nome:'Test Agent',email:`test${++seq}@example.test`,telefone:`+1202555${String(seq).padStart(4,'0')}`,idioma:'en',fuso:'America/New_York',slot:new Date(slot.getTime()+offset*60000).toISOString(),requestId:`a97687f0-d792-4b27-bd06-${String(seq).padStart(12,'0')}`,tracking:{}})
 const book=(client,p)=>client.query('SELECT equipe_book($1::jsonb,$2::text)',[JSON.stringify(p),`ip-${p.email}`])
 async function contend(first,second) {
  await a.query('BEGIN'); await first()
  let settled=false
  const blocked=second().then(()=>({ok:true}),error=>({ok:false,error})).finally(()=>{settled=true})
  await new Promise(r=>setTimeout(r,200)); assert.equal(settled,false,'second session waits on calendar row')
  await a.query('COMMIT')
  const result=await blocked; assert.equal(result.ok,false); assert.match(result.error.message,/slot_taken/)
 }
 const p=payload()
 await contend(()=>book(a,p),()=>book(b,payload()))
 // Race with an ordinary /nova-style appointment insert in both orders.
 const {rows:[owner]}=await admin.query('SELECT id FROM buyers LIMIT 1')
 const {rows:[lead]}=await admin.query(`INSERT INTO leads(name,raw_data) VALUES('Nova test','{"source":"landing_nova"}') RETURNING id`)
 const insert=(client,offset)=>client.query("INSERT INTO appointments(lead_id,buyer_id,scheduled_at,status) VALUES($1,$2,$3,'scheduled')",[lead.id,owner.id,new Date(slot.getTime()+offset*60000)])
 await contend(()=>insert(a,60),()=>book(b,payload(60)))
 const p2=payload(120)
 await contend(()=>book(a,p2),()=>insert(b,120))
 // Concurrent identical retries commit only once and both receive success.
 const p3=payload(240)
 const results=await Promise.all([book(a,p3),book(b,p3)])
 assert.ok(results.every(r=>r.rows[0].equipe_book.ok))
 const counts=await admin.query(`SELECT (SELECT count(*) FROM appointments)::int appointments,(SELECT count(*) FROM leads WHERE raw_data->>'source'='landing_equipe')::int recruits`)
 assert.deepEqual(counts.rows[0],{appointments:4,recruits:3})
 console.log(JSON.stringify({passed:true,cases:['recruit vs recruit','nova first','recruit first','concurrent idempotent retry'],counts:counts.rows[0]}))
} finally {await Promise.all([admin.end(),a.end(),b.end()])}
