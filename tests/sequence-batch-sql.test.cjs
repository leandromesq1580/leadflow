/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS node:test harness; no application or environment imports. */
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, existsSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const buyer='00000000-0000-4000-8000-000000000001'
const other='00000000-0000-4000-8000-000000000002'
const lead='00000000-0000-4000-8000-000000000003'
const migration='supabase/migrations/053_ai_suppression_resolution.sql'
async function applyPacing(db) {
 for (const migration of ['054_sequence_batch_pacing.sql', '055_sequence_batch_completion_clock.sql', '056_sequence_reply_stage.sql']) {
  await db.exec(readFileSync('supabase/migrations/' + migration, 'utf8'))
 }
 const pacing = 'supabase/migrations/060_sequence_six_per_fifteen.sql'
 if (existsSync(pacing)) await db.exec(readFileSync(pacing, 'utf8'))
}
async function fixture() {
 const db=new PGlite()
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select null::uuid';
 CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'select gen_random_uuid()';
 CREATE TABLE buyers(id uuid primary key, auth_user_id uuid, is_active boolean default true);
 CREATE TABLE leads(id uuid primary key, assigned_to uuid, assigned_to_member uuid, archived boolean default false, contract_closed boolean default false, sms_opted_out boolean default false);
 CREATE TABLE pipelines(id uuid primary key,buyer_id uuid);
 CREATE TABLE pipeline_stages(id uuid primary key,pipeline_id uuid,name text);
 CREATE TABLE pipeline_leads(id uuid primary key,lead_id uuid,pipeline_id uuid,stage_id uuid,moved_at timestamptz default now());
 CREATE TABLE templates(id uuid primary key,buyer_id uuid,is_system boolean,type text default 'whatsapp');
 CREATE TABLE sms_messages(id uuid primary key default gen_random_uuid(),lead_id uuid,direction text,body text,created_at timestamptz default now());`)
 const base=readFileSync('supabase/migrations/006_inbox_sequences_ai_push.sql','utf8')
 await db.exec(base.slice(0,base.indexOf('-- AI LEAD SCORING')))
 await db.exec(readFileSync('supabase/migrations/052_ai_sequences_until_reply.sql','utf8'))
 // Baseline RED introduces only the proposed storage field, NOT the behavior.
 if(existsSync(migration)) await db.exec(readFileSync(migration,'utf8'))
 else await db.exec('ALTER TABLE ai_sequence_suppressions ADD COLUMN resolved_at timestamptz')
 await db.query('insert into buyers(id) values($1),($2)',[buyer,other])
 await db.query('insert into leads(id,assigned_to) values($1,$2)',[lead,buyer])
 const {rows:[s]}=await db.query("select * from save_sequence($1,null,$2,'[]')",[buyer,{name:'Fixture',mode:'ai_until_reply',ai_config:{}}])
 await db.query('update sequences set enabled=true where id=$1',[s.id])
 const {rows:[e]}=await db.query("select * from enroll_sequence($1,$2,$3,'2000-01-01')",[buyer,s.id,lead])
 const block=async()=> (await db.query('select ai_sequence_block($1,$2,$3) reason',[buyer,lead,s.id])).rows[0].reason
 return {db,s,e,block}
}

test('legacy cancellations serialize state, ignore outbound receipts, and preserve delete ambiguity',async()=>{
 const {db}=await fixture()
 try{
  await applyPacing(db)
  for(const kind of ['media','stop','manual','owner','optout','receipt','delete']){
   const l=(await db.query('insert into leads(id,assigned_to) values(gen_random_uuid(),$1) returning id',[buyer])).rows[0]
   const s=(await db.query("insert into sequences(buyer_id,name) values($1,'legacy') returning id",[buyer])).rows[0]
   await db.query("insert into sequence_steps(sequence_id,step_order,delay_hours,step_type,custom_body) values($1,0,0,'send_template','fixture')",[s.id])
   const e=(await db.query("select * from enroll_sequence($1,$2,$3,'2000-01-01')",[buyer,s.id,l.id])).rows[0]
   const c=(await db.query('select * from claim_legacy_sequence($1)',[e.id])).rows[0]
   const begin=async()=>(await db.query("select begin_sequence_batch($1,$2,'15555550777','fixture') r",[e.id,c.lease_token])).rows[0].r.allowed
   if(kind==='delete')assert.equal(await begin(),true)
   if(['media','stop','receipt'].includes(kind))await db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body) values($1,$2,$3,'15555550999','15555550777',$4)",[buyer,l.id,kind==='receipt'?'out':'in',kind==='stop'?'STOP':kind==='media'?'[image]':'receipt'])
   if(kind==='manual')await db.query('select stop_sequence_enrollment($1,$2)',[buyer,e.id])
   if(kind==='owner')await db.query('update leads set assigned_to=$1 where id=$2',[other,l.id])
   if(kind==='optout')await db.query('update leads set sms_opted_out=true where id=$1',[l.id])
   if(kind==='delete'){
    await db.query('delete from sequence_enrollments where id=$1',[e.id])
    assert.equal((await db.query('select reason from ai_sequence_suppressions where lead_id=$1',[l.id])).rows[0]?.reason,'delivery_unknown')
    const fresh=(await db.query("select * from enroll_sequence($1,$2,$3,'2000-01-01')",[buyer,s.id,l.id])).rows[0]
    assert.equal((await db.query('select * from claim_legacy_sequence($1)',[fresh.id])).rows.length,0)
   }else{
    const row=(await db.query('select status,stop_reason from sequence_enrollments where id=$1',[e.id])).rows[0]
    assert.equal(row.status,kind==='receipt'?'active':'stopped',kind)
    if(kind==='media')assert.equal(row.stop_reason,'replied')
    if(kind==='stop')assert.equal(row.stop_reason,'optout')
    assert.equal(await begin(),kind==='receipt',kind)
   }
  }
 }finally{await db.close()}
})

test('lost begin response is quarantined even when caller reports sending false',async()=>{
 for(const mode of ['legacy','ai_until_reply']){
  const {db,e}=await fixture()
  try{
   await applyPacing(db)
   await db.query('update sequence_enrollments set mode=$1 where id=$2',[mode,e.id])
   await db.query("update sequences set ai_config=$1 where id=$2",[{timezone:'UTC',days:[0,1,2,3,4,5,6],start:'00:00',end:'23:59'},e.sequence_id])
   const c=(await db.query(`select * from ${mode==='legacy'?'claim_legacy_sequence':'claim_ai_sequence'}($1)`,[e.id])).rows[0]
   assert.equal((await db.query("select begin_sequence_batch($1,$2,'15555550888','fixture') r",[e.id,c.lease_token])).rows[0].r.allowed,true)
   await db.query("select defer_sequence_batch($1,$2,'network_error',now(),false)",[e.id,c.lease_token])
   const state=(await db.query('select status,delivery_status,lease_token,current_step from sequence_enrollments where id=$1',[e.id])).rows[0]
   const ledger=(await db.query('select state from sequence_batch_dispatches where token=$1',[c.lease_token])).rows[0]
   console.log('lost-response',mode,JSON.stringify({state,ledger}))
   assert.equal(ledger.state,'unknown');assert.equal(state.delivery_status,'unknown');assert.equal(state.status,'paused');assert.equal(state.current_step,0)
   assert.equal((await db.query('select reason from ai_sequence_suppressions where lead_id=$1',[lead])).rows[0].reason,'delivery_unknown')
  }finally{await db.close()}
 }
})

test('expired orphan dispatch holds sender indefinitely without rearming STOP',async()=>{
 const {db}=await fixture()
 try {
  await applyPacing(db)
  async function make(){
   const l=(await db.query('insert into leads(id,assigned_to) values(gen_random_uuid(),$1) returning id',[buyer])).rows[0]
   const s=(await db.query("insert into sequences(buyer_id,name) values($1,'fixture') returning id",[buyer])).rows[0]
   await db.query("insert into sequence_steps(sequence_id,step_order,delay_hours,step_type,custom_body) values($1,0,0,'send_template','fixture')",[s.id])
   const e=(await db.query("insert into sequence_enrollments(sequence_id,lead_id,buyer_id,next_run_at) values($1,$2,$3,'2000-01-01') returning id",[s.id,l.id,buyer])).rows[0]
   return (await db.query('select * from claim_legacy_sequence($1)',[e.id])).rows[0]
  }
  const begin=async(e,sender)=>(await db.query("select begin_sequence_batch($1,$2,$3,'fixture') r",[e.id,e.lease_token,sender])).rows[0].r.allowed
  const finish=async(e,sender)=>(await db.query("select finish_sequence_batch($1,$2,$3,'',now(),$4,'15555550999') ok",[e.id,e.lease_token,'ack-'+e.id,sender])).rows[0].ok
  for(const scenario of ['stopped','deleted','no_return']){
   const sender={stopped:'15555550400',deleted:'15555550500',no_return:'15555550600'}[scenario]
   let stuck
   for(let i=0;i<6;i++) {stuck=await make();assert.equal(await begin(stuck,sender),true);if(i<5)assert.equal(await finish(stuck,sender),true)}
   if(scenario==='stopped')await db.query('select stop_sequence_enrollment($1,$2)',[buyer,stuck.id])
   // Synthetic fixture deletion only: the durable ledger intentionally has no enrollment FK.
   if(scenario==='deleted')await db.query('delete from sequence_enrollments where id=$1',[stuck.id])
   const snapshot=(await db.query('select * from sequence_enrollments where id=$1',[stuck.id])).rows
   const suppressions=(await db.query('select * from ai_sequence_suppressions order by buyer_id,lead_id')).rows
   // Explicit persisted deadline, independent of enrollment lease/status/existence.
   const columns=(await db.query("select column_name from information_schema.columns where table_name='sequence_batch_dispatches'")).rows.map(r=>r.column_name)
   assert.ok(columns.includes('expires_at'),'dispatch must have a durable database expiry')
   assert.equal((await db.query('select expire_sequence_batch_dispatches($1) n',[sender])).rows[0].n,0,'unexpired dispatch stays in flight')
   await db.query("update sequence_batch_dispatches set expires_at=clock_timestamp()-interval '1 second' where token=$1",[stuck.lease_token])
   assert.equal(await finish(stuck,sender),false,'expired confirmation cannot advance even before cleanup')
   await db.query("update sequence_sender_batches set cooldown_until=clock_timestamp()-interval '10 minutes' where sender=$1",[sender])
   const next=await make()
   assert.equal((await db.query('select preflight_sequence_batch($1,$2,$3) ok',[next.id,next.lease_token,sender])).rows[0].ok,false)
   assert.equal((await db.query('select state from sequence_batch_dispatches where token=$1',[stuck.lease_token])).rows[0].state,'unknown')
   const b=(await db.query('select *,cooldown_until>=clock_timestamp()+interval \'899 seconds\' conservative from sequence_sender_batches where sender=$1',[sender])).rows[0]
   assert.equal(b.used,6);assert.equal(b.conservative,true)
   assert.equal(await finish(stuck,sender),false,'late confirmation must not advance quarantined enrollment')
   assert.deepEqual((await db.query('select * from sequence_enrollments where id=$1',[stuck.id])).rows,snapshot)
   assert.deepEqual((await db.query('select * from ai_sequence_suppressions order by buyer_id,lead_id')).rows,suppressions)
   assert.equal(await begin(stuck,sender),false,'unknown is never re-sent')
   await db.query('select expire_sequence_batch_dispatches($1)',[sender])
   assert.equal((await db.query('select cooldown_until from sequence_sender_batches where sender=$1',[sender])).rows[0].cooldown_until.getTime(),b.cooldown_until.getTime(),'cleanup is idempotent')
   await db.query("update sequence_sender_batches set cooldown_until=clock_timestamp()-interval '1 second' where sender=$1",[sender])
   const fresh=await make()
   assert.equal((await db.query('select preflight_sequence_batch($1,$2,$3) ok',[fresh.id,fresh.lease_token,sender])).rows[0].ok,false)
   assert.equal(await begin(await make(),sender),false)
   assert.equal((await db.query('select used from sequence_sender_batches where sender=$1',[sender])).rows[0].used,6)
   assert.equal((await db.query('select count(*)::int n from sequence_batch_dispatches where sender=$1',[sender])).rows[0].n,6)
  }
  for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query("select has_function_privilege($1,'public.expire_sequence_batch_dispatches(text)','execute') ok",[role])).rows[0].ok,role==='service_role')
 }finally{await db.close()}
})

test('shared sender grants six, then durably waits without consuming attempt or advancing',async()=>{
 const {db,e}=await fixture()
 try {
  const path='supabase/migrations/054_sequence_batch_pacing.sql'
  assert.ok(existsSync(path),'batch pacing migration must exist')
  await applyPacing(db)
  for(let i=0;i<7;i++) {
   const leadId=`00000000-0000-4000-8001-${String(i).padStart(12,'0')}`
   await db.query('insert into leads(id,assigned_to) values($1,$2)',[leadId,buyer])
   const {rows:[en]}=await db.query("insert into sequence_enrollments(sequence_id,lead_id,buyer_id,next_run_at) values($1,$2,$3,'2000-01-01') returning *",[e.sequence_id,leadId,buyer])
   const {rows:[c]}=await db.query('select * from claim_legacy_sequence($1)',[en.id])
   const {rows:[r]}=await db.query("select begin_sequence_batch($1,$2,'15555550100','fixture') result",[en.id,c.lease_token])
   assert.equal(r.result.allowed,i<6)
   const {rows:[state]}=await db.query('select * from sequence_enrollments where id=$1',[en.id])
   assert.equal(state.current_step,0)
   if(i===6){assert.equal(state.attempts,0);assert.equal(state.status,'active');assert.equal(state.delivery_status,'idle');assert.ok(state.next_run_at>new Date())}
   else assert.equal((await db.query("select begin_sequence_batch($1,$2,'15555550100','fixture') result",[en.id,c.lease_token])).rows[0].result.allowed,false)
  }
  assert.equal((await db.query('select used from sequence_sender_batches')).rows[0].used,6)
 }finally{await db.close()}
})

test('preflight waits before generation; finish is idempotent, cancellation survives and numbers are independent',async()=>{
 const {db,e}=await fixture()
 try {
  await applyPacing(db)
  await db.query("update sequences set ai_config=$1 where id=$2",[{timezone:'UTC',days:[0,1,2,3,4,5,6],start:'00:00',end:'23:59'},e.sequence_id])
  let c=(await db.query('select * from claim_ai_sequence($1)',[e.id])).rows[0]
  await db.exec("insert into sequence_sender_batches(sender,used,cooldown_until) values('15555550100',10,clock_timestamp()+interval '5 minutes')")
  assert.equal((await db.query("select preflight_sequence_batch($1,$2,'15555550100') ok",[e.id,c.lease_token])).rows[0].ok,false)
  let row=(await db.query('select * from sequence_enrollments where id=$1',[e.id])).rows[0]
  assert.equal(row.attempts,0);assert.equal(row.generation_status,'idle');assert.equal(row.status,'active')
  await db.query("update sequence_enrollments set next_run_at='2000-01-01' where id=$1",[e.id])
  c=(await db.query('select * from claim_ai_sequence($1)',[e.id])).rows[0]
  assert.equal((await db.query("select begin_sequence_batch($1,$2,'15555550200','fixture') r",[e.id,c.lease_token])).rows[0].r.allowed,true)
  await db.query('select stop_sequence_enrollment($1,$2)',[buyer,e.id])
  for(let i=0;i<2;i++)assert.equal((await db.query("select finish_sequence_batch($1,$2,'fixture-ack','choice',now(),'15555550200','15555550999') ok",[e.id,c.lease_token])).rows[0].ok,true)
  row=(await db.query('select * from sequence_enrollments where id=$1',[e.id])).rows[0]
  assert.equal(row.status,'stopped');assert.equal(row.current_step,1)
 }finally{await db.close()}
})

test('AI cannot bypass pacing with null sender',async()=>{
 const {db,e}=await fixture()
 try {
  await applyPacing(db)
  await db.query("update sequences set ai_config=$1 where id=$2",[{timezone:'UTC',days:[0,1,2,3,4,5,6],start:'00:00',end:'23:59'},e.sequence_id])
  const c=(await db.query('select * from claim_ai_sequence($1)',[e.id])).rows[0]
  assert.equal((await db.query("select begin_sequence_batch($1,$2,null,'fixture') r",[e.id,c.lease_token])).rows[0].r.allowed,false)
  assert.equal((await db.query('select count(*)::int n from sequence_batch_dispatches')).rows[0].n,0)
 }finally{await db.close()}
})

test('full-batch cooldown starts after completion, partial idle reset, shared buyers, waits at attempt three and independent exclusions',async()=>{
 const {db}=await fixture()
 try {
  await applyPacing(db)
  async function legacy(owner=buyer,kind='send_template'){
   const l=(await db.query('insert into leads(id,assigned_to) values(gen_random_uuid(),$1) returning id',[owner])).rows[0]
   const s=(await db.query("insert into sequences(buyer_id,name) values($1,'fixture') returning id",[owner])).rows[0]
   await db.query("insert into sequence_steps(sequence_id,step_order,delay_hours,step_type,custom_body) values($1,0,0,$2,'fixture')",[s.id,kind])
   const e=(await db.query("insert into sequence_enrollments(sequence_id,lead_id,buyer_id,next_run_at) values($1,$2,$3,'2000-01-01') returning *",[s.id,l.id,owner])).rows[0]
   return (await db.query('select * from claim_legacy_sequence($1)',[e.id])).rows[0]
  }
  const begin=async(e,sender)=>(await db.query("select begin_sequence_batch($1,$2,$3,'fixture') r",[e.id,e.lease_token,sender])).rows[0].r.allowed
  const finish=async(e,sender)=>(await db.query("select finish_sequence_batch($1,$2,$3,'',now(),$4,'15555550999') ok",[e.id,e.lease_token,'ack-'+e.id,sender])).rows[0].ok
  for(let i=0;i<6;i++){const e=await legacy(i%2?buyer:other);assert.equal(await begin(e,'15555550300'),true);assert.equal(await finish(e,'15555550300'),true)}
  const b=(await db.query("select * from sequence_sender_batches where sender='15555550300'")).rows[0]
  assert.equal(b.used,6);assert.ok(b.cooldown_until.getTime()-b.last_reserved_at.getTime()>=900000)
  const pending=await legacy();await db.query('update sequence_enrollments set attempts=3 where id=$1',[pending.id])
  assert.equal(await begin(pending,'15555550300'),false)
  const state=(await db.query('select * from sequence_enrollments where id=$1',[pending.id])).rows[0]
  assert.equal(state.attempts,2);assert.equal(state.status,'active');assert.equal(state.current_step,0)
  await db.exec("update sequence_sender_batches set cooldown_until=clock_timestamp()-interval '1 second' where sender='15555550300'")
  const fresh=await legacy();assert.equal(await begin(fresh,'15555550300'),true);await finish(fresh,'15555550300')
  assert.equal((await db.query("select used from sequence_sender_batches where sender='15555550300'")).rows[0].used,1)
  await db.exec("update sequence_sender_batches set last_reserved_at=clock_timestamp()-interval '16 minutes',last_settled_at=clock_timestamp()-interval '16 minutes' where sender='15555550300'")
  const partial=await legacy();assert.equal(await begin(partial,'15555550300'),true);await finish(partial,'15555550300')
  assert.equal((await db.query("select used from sequence_sender_batches where sender='15555550300'")).rows[0].used,1)
  const wait=await legacy(buyer,'wait');assert.equal(await begin(wait,null),true);assert.equal(await finish(wait,''),true)
  const done=(await db.query('select * from sequence_enrollments where id=$1',[wait.id])).rows[0];assert.equal(done.status,'completed');assert.equal(done.current_step,1)
  const unknown=await legacy();assert.equal(await begin(unknown,'15555550300'),true)
  await db.query("select defer_sequence_batch($1,$2,'delivery_unknown',now(),true)",[unknown.id,unknown.lease_token])
  assert.equal((await db.query('select * from claim_legacy_sequence($1)',[unknown.id])).rows.length,0)
  assert.equal((await db.query('select state from sequence_batch_dispatches where token=$1',[unknown.lease_token])).rows[0].state,'unknown')
  const expired=await legacy();await db.query("update sequence_enrollments set lease_until=clock_timestamp()-interval '1 second' where id=$1",[expired.id]);assert.equal(await begin(expired,'15555550300'),false)
  const moved=await legacy();await db.query('update leads set assigned_to=$1 where id=$2',[other,moved.lead_id]);assert.equal(await begin(moved,'15555550300'),false)
  assert.equal((await db.query("select has_function_privilege('authenticated','public.begin_sequence_batch(uuid,uuid,text,text)','execute') ok")).rows[0].ok,false)
 }finally{await db.close()}
})
