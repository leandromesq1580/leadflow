// Opt-in, real PostgreSQL multi-session regression. Synthetic contacts; never a provider call.
// EC_TEST_SOCKET=/local/socket EC_TEST_TOOL_DIR=/tools-with-pg node tests/email-campaign-tracking-race.pg.mjs
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import assert from 'node:assert/strict'
const host=process.env.EC_TEST_SOCKET
if(!host?.startsWith('/'))throw new Error('Local Unix socket required; network databases forbidden')
const require=createRequire((process.env.EC_TEST_TOOL_DIR||process.cwd())+'/package.json')
const {Client}=require('pg')
const clients=[],results=[]
async function connect(database='postgres'){
 const c=new Client({host,port:55432,user:process.env.USER||'hermes',database,statement_timeout:15000})
 await c.connect();clients.push(c);return c
}
const rpc=async(c,name,args)=>(await c.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value
const confirmed={open:true,click:true,status:'verified'}
async function scenario(name,current,resend=false){
 const start=clients.length
 try{
  const ctl=await connect(),database='ec_tracking_race_'+randomUUID().replaceAll('-','')
  await ctl.query('CREATE DATABASE '+database)
  const db=await connect(database),admin=await connect(database),blocker=await connect(database),worker=await connect(database)
  await db.query(`create table buyers(id uuid primary key,is_admin boolean,name text);
   create table leads(id uuid primary key default gen_random_uuid(),name text,email text,state text,type text default 'hot',assigned_to uuid,lead_language text,form_name text,created_at timestamptz default now());`)
  for(const role of ['anon','authenticated','service_role'])if(!(await ctl.query('select 1 from pg_roles where rolname=$1',[role])).rowCount)await ctl.query('CREATE ROLE '+role)
  for(const file of ['062_admin_email_campaigns.sql','063_email_campaign_tracking_resend.sql'])await db.query(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
  const actor=randomUUID();await db.query('insert into buyers values($1,true,$2)',[actor,'Synthetic admin'])
  await db.query("insert into leads(name,email,state,lead_language) values('Synthetic target','target-race@example.invalid','FL','pt'),('Synthetic sentinel','sentinel-race@example.invalid','NH','pt')")
  await rpc(db,'ec_record_permission',[actor,'{}','{}','Synthetic permission only for isolated regression',true])
  async function campaign(state){
   const c=await rpc(db,'ec_save',[actor,null,JSON.stringify({name:'Synthetic '+state,subject_pt:'Seguro',body_pt:'Seguro',subject_es:'Seguro',body_es:'Seguro',filters:{states:[state]}})])
   await rpc(db,'ec_schedule',[actor,c.id,new Date(Date.now()-60000).toISOString(),'{}',1,JSON.stringify(confirmed)]);return c
  }
  let target=await campaign('FL')
  if(resend){
   const r=await rpc(db,'ec_claim',[200,JSON.stringify(confirmed)]);assert.equal(r.campaign.id,target.id)
   assert.equal(await rpc(db,'ec_authorize',[r.id,r.lease]),true)
   const provider='synthetic-'+randomUUID();await rpc(db,'ec_finish',[r.id,r.lease,'accepted',provider,null])
   await rpc(db,'ec_event',['synthetic-delivered-'+randomUUID(),provider,'email.delivered',new Date(Date.now()-72*3600e3).toISOString()])
   target=(await rpc(db,'ec_resend_create',[actor,target.id])).campaign
   await rpc(db,'ec_schedule',[actor,target.id,new Date(Date.now()-60000).toISOString(),'{}',1,JSON.stringify(confirmed)])
  }
  await rpc(db,'ec_control',[actor,target.id,'pause'])
  const snapshot=(await db.query('select tracking_snapshot from email_campaigns where id=$1',[target.id])).rows[0].tracking_snapshot
  const sentinel=await campaign('NH');await rpc(db,'ec_control',[actor,sentinel.id,'cancel'])
  // The expired sentinel reservation stops the scan after the admin-held target was skipped.
  await db.query("update email_campaign_recipients set state='reserved',lease=gen_random_uuid(),lease_until=now()-interval '1 minute' where campaign_id=$1",[sentinel.id])
  const quotaBefore=(await db.query('select day_used,minute_used from email_campaign_rate')).rows[0]
  await admin.query('begin');await rpc(admin,'ec_control',[actor,target.id,'resume'])
  await blocker.query('begin');await blocker.query('select id from email_campaign_recipients where campaign_id=$1 for update',[sentinel.id])
  const pending=rpc(worker,'ec_claim',[200,JSON.stringify(current)])
  let observed=false
  try{
   for(let i=0;i<200;i++){
    if((await db.query('select pg_blocking_pids($1) blockers',[worker.processID])).rows[0].blockers.includes(blocker.processID)){observed=true;break}
    await delay(10)
   }
   assert(observed,'Worker must block on sentinel after skipping the target')
   await admin.query('commit')
  }finally{await blocker.query('commit')}
  const claim=await pending
  const state=(await db.query('select state,pause_reason,tracking_snapshot from email_campaigns where id=$1',[target.id])).rows[0]
  if(current.status==='verified'&&current.open===true&&current.click===true){
   assert.equal(claim?.campaign.id,target.id);assert.equal(claim.state,'reserved')
   assert.equal(await rpc(db,'ec_authorize',[claim.id,claim.lease]),true)
  }else{
   assert.equal(claim,null,'Unconfirmed tracking must never reserve the resumed campaign')
   assert.equal(state.state,'paused');assert.equal(state.pause_reason,'tracking_not_confirmed')
   assert.deepEqual((await db.query('select day_used,minute_used from email_campaign_rate')).rows[0],quotaBefore,'Rejected tracking must not consume quota')
   assert.equal((await db.query("select count(*)::int n from email_campaign_recipients where campaign_id=$1 and state='pending'",[target.id])).rows[0].n,1)
   assert.equal((await db.query("select count(*)::int n from email_campaign_audit where campaign_id=$1 and action='pause' and details->>'reason'='tracking_not_confirmed'",[target.id])).rows[0].n,1)
   assert.deepEqual(state.tracking_snapshot,snapshot,'Promise is immutable')
  }
  results.push({name,passed:true,database});console.log('PASS '+name)
 }catch(e){results.push({name,passed:false,error:e.message});console.log('FAIL '+name+': '+e.message)}
 finally{for(const c of clients.slice(start)){try{await c.query('rollback')}catch{}await c.end()}}
}
await scenario('original resume racing with claim pauses when provider status is unknown',{open:null,click:null,status:'unknown'})
await scenario('original resume racing with claim pauses when promised clicks are disabled',{open:true,click:false,status:'verified'})
await scenario('resend resume racing with claim pauses when provider status is unknown',{open:null,click:null,status:'unknown'},true)
await scenario('confirmed tracking permits the racing resumed campaign',confirmed)
console.log(JSON.stringify({checked_at:new Date().toISOString(),source:'real-local-postgresql',passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,provider_send_calls:0,results},null,2))
if(results.some(r=>!r.passed))process.exitCode=1
