// Opt-in multi-session integration. Only a local Unix socket is accepted; never production.
// EC_TEST_SOCKET=/local/socket EC_TEST_TOOL_DIR=/tools-with-pg node tests/email-campaigns.pg.mjs
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
const host=process.env.EC_TEST_SOCKET
if(!host?.startsWith('/'))throw new Error('A local Unix socket is required; network databases are forbidden')
const require=createRequire((process.env.EC_TEST_TOOL_DIR||process.cwd())+'/package.json')
const {Client}=require('pg')
const clients=[]
async function connection(database='postgres'){
 const c=new Client({host,port:55432,database,user:process.env.USER||'hermes',statement_timeout:15000});await c.connect();clients.push(c);return c
}
const root=await connection(),database='ec_test_'+randomUUID().replaceAll('-','')
await root.query('CREATE DATABASE '+database)
const db=await connection(database)
const roleNames=['anon','authenticated','service_role']
for(const r of roleNames){const exists=await root.query('select 1 from pg_roles where rolname=$1',[r]);if(!exists.rowCount)await root.query('CREATE ROLE '+r)}
const actor=randomUUID()
await db.query(`create table buyers(id uuid primary key,is_admin boolean,name text);
 create table leads(id uuid primary key default gen_random_uuid(),name text,email text,state text,type text default 'hot',assigned_to uuid,lead_language text,form_name text,created_at timestamptz default now());`)
await db.query('insert into buyers(id,is_admin,name) values($1,true,$2)',[actor,'Synthetic admin'])
await db.query(readFileSync(new URL('../supabase/migrations/062_admin_email_campaigns.sql',import.meta.url),'utf8'))
const rpc=async(c,n,args=[])=> (await c.query(`select public.${n}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value
async function fixture(state,n=12){
 for(const c of (await db.query("select id from email_campaigns where state in ('draft','scheduled','running','paused')")).rows)await rpc(db,'ec_control',[actor,c.id,'cancel'])
 await db.query("update email_campaign_rate set day_used=0,minute_used=0,minute=null")
 for(let i=0;i<n;i++)await db.query('insert into leads(name,email,state,lead_language) values($1,$2,$3,$4)',['Synthetic '+i,randomUUID()+'@example.invalid',state,'pt'])
 const filters=JSON.stringify({states:[state]})
 await rpc(db,'ec_record_permission',[actor,filters,'{}','Documented synthetic insurance consent fixture',true])
 const campaign=await rpc(db,'ec_save',[actor,null,JSON.stringify({name:'Synthetic '+state,subject_pt:'Olá',body_pt:'Seguro',subject_es:'Hola',body_es:'Seguro',filters:JSON.parse(filters)})])
 await rpc(db,'ec_schedule',[actor,campaign.id,new Date().toISOString(),'{}',n]);return campaign
}
async function blocked(c){
 for(let i=0;i<100;i++){
  const r=await db.query('select cardinality(pg_blocking_pids($1)) n',[c.processID]);if(r.rows[0].n>0)return
  await delay(10)
 }
 throw new Error('Expected a real database lock wait')
}
const results=[]
async function check(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS '+name)}catch(e){results.push({name,passed:false,error:e.message});console.log('FAIL '+name+': '+e.message)}}
try{
 await check('20 simultaneous workers reserve at most 10 distinct recipients globally',async()=>{
  const c=await fixture('FL',20),workers=await Promise.all(Array.from({length:20},()=>connection(database)))
  const claims=await Promise.all(workers.map(w=>rpc(w,'ec_claim',[200])))
  const valid=claims.filter(Boolean);assert.equal(valid.length,10);assert.equal(new Set(valid.map(x=>x.id)).size,10)
  assert.equal((await db.query('select minute_used from email_campaign_rate')).rows[0].minute_used,10)
  await rpc(db,'ec_control',[actor,c.id,'cancel'])
 })
 await check('lease timestamp is measured AFTER waiting for the global quota lock',async()=>{
  const c=await fixture('NH',2),holder=await connection(database),worker=await connection(database)
  await holder.query('begin');await holder.query('select * from email_campaign_rate for update')
  const pending=rpc(worker,'ec_claim',[200]);await blocked(worker);await delay(350)
  const released=Date.now();await holder.query('commit');const r=await pending
  assert.ok(Date.parse(r.lease_until)>=released+299900,'Lease was measured before the quota lock was acquired')
  await rpc(db,'ec_control',[actor,c.id,'cancel'])
 })
 await check('pause winning the campaign lock prevents authorization, not just future reservations',async()=>{
  const c=await fixture('CA',2),r=await rpc(db,'ec_claim',[200]),holder=await connection(database),worker=await connection(database)
  await holder.query('begin');await holder.query('select * from email_campaigns where id=$1 for update',[c.id])
  const auth=rpc(worker,'ec_authorize',[r.id,r.lease]);await blocked(worker)
  await rpc(holder,'ec_control',[actor,c.id,'pause']);await holder.query('commit');assert.equal(await auth,false)
  await rpc(db,'ec_control',[actor,c.id,'cancel'])
 })
 await check('unsubscribe winning the contact lock prevents the reserved email from sending',async()=>{
  const c=await fixture('OR',2),r=await rpc(db,'ec_claim',[200]),holder=await connection(database),worker=await connection(database)
  await holder.query('begin');await holder.query('update email_campaign_contacts set suppressed_at=now() where email=$1',[r.email])
  const auth=rpc(worker,'ec_authorize',[r.id,r.lease]);await blocked(worker)
  await rpc(holder,'ec_unsubscribe',[r.unsubscribe_token]);await holder.query('commit');assert.equal(await auth,false)
  await rpc(db,'ec_control',[actor,c.id,'cancel'])
 })
 await check('unsubscribe never waits for a pending recipient row while holding the contact lock',async()=>{
  const c=await fixture('CO',2),holder=await connection(database),worker=await connection(database)
  const r=(await db.query("select id,unsubscribe_token from email_campaign_recipients where campaign_id=$1 and state='pending' order by id limit 1",[c.id])).rows[0]
  await holder.query('begin');await holder.query('select id from email_campaign_recipients where id=$1 for update',[r.id])
  const unsubscribe=rpc(worker,'ec_unsubscribe',[r.unsubscribe_token])
  try{assert.equal(await Promise.race([unsubscribe,delay(1000).then(()=>false)]),true)}finally{await holder.query('rollback');await unsubscribe}
  await rpc(db,'ec_claim',[200])
  assert.equal((await db.query('select state from email_campaign_recipients where id=$1',[r.id])).rows[0].state,'suppressed')
  await rpc(db,'ec_control',[actor,c.id,'cancel'])
 })
 await check('finishing takes the campaign lock before the recipient lock, avoiding a deadlock with expiry',async()=>{
  const c=await fixture('WA',2),r=await rpc(db,'ec_claim',[200]);await rpc(db,'ec_authorize',[r.id,r.lease])
  const holder=await connection(database),worker=await connection(database)
  await holder.query('begin');await holder.query('select id from email_campaigns where id=$1 for update',[c.id])
  const finish=rpc(worker,'ec_finish',[r.id,r.lease,'accepted','synthetic-'+randomUUID(),null])
  try{await blocked(worker);await holder.query('select id from email_campaign_recipients where id=$1 for update nowait',[r.id])}
  finally{await holder.query('rollback');await finish}
  await rpc(db,'ec_control',[actor,c.id,'cancel'])
 })
 await check('already authorized email remains in flight when pause wins afterward',async()=>{
  const c=await fixture('TX',2),r=await rpc(db,'ec_claim',[200]),holder=await connection(database),worker=await connection(database)
  await holder.query('begin');assert.equal(await rpc(holder,'ec_authorize',[r.id,r.lease]),true)
  const paused=rpc(worker,'ec_control',[actor,c.id,'pause']);await blocked(worker);await holder.query('commit');assert.equal((await paused).state,'paused')
  await rpc(db,'ec_finish',[r.id,r.lease,'accepted','synthetic-'+randomUUID(),null])
  assert.equal((await db.query('select state from email_campaign_recipients where id=$1',[r.id])).rows[0].state,'accepted')
  await rpc(db,'ec_control',[actor,c.id,'cancel'])
 })
}finally{
 for(const c of clients)await c.end()
 console.log(JSON.stringify({source:'real-local-postgresql-16',database,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results},null,2))
 if(results.some(r=>!r.passed))process.exitCode=1
}
