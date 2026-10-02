/* eslint-disable @typescript-eslint/no-require-imports -- Local SQL harness, no application or environment imports. */
const test = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync, existsSync} = require('node:fs')
const {PGlite} = require('@electric-sql/pglite')
const buyer='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002'
async function fixture() {
 const db=new PGlite()
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select null::uuid';
 CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'select gen_random_uuid()';
 CREATE TABLE buyers(id uuid primary key,auth_user_id uuid,is_active boolean default true);
 CREATE TABLE leads(id uuid primary key default gen_random_uuid(),assigned_to uuid,assigned_to_member uuid,phone text,archived boolean default false,contract_closed boolean default false,sms_opted_out boolean default false);
 CREATE TABLE templates(id uuid primary key,buyer_id uuid,is_system boolean,type text default 'whatsapp');
 CREATE TABLE sms_messages(id uuid primary key default gen_random_uuid(),lead_id uuid,direction text,body text,from_phone text,to_phone text,twilio_sid text unique,created_at timestamptz default now());`)
 const crm=readFileSync('supabase/migrations/004_kanban_crm.sql','utf8')
 await db.exec(crm.slice(0,crm.indexOf('-- 4. Follow-ups')))
 const base=readFileSync('supabase/migrations/006_inbox_sequences_ai_push.sql','utf8')
 await db.exec(base.slice(0,base.indexOf('-- AI LEAD SCORING')))
 for(const name of ['052_ai_sequences_until_reply.sql','053_ai_suppression_resolution.sql','054_sequence_batch_pacing.sql','055_sequence_batch_completion_clock.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'))
 const file='supabase/migrations/056_sequence_reply_stage.sql'
 if(existsSync(file))await db.exec(readFileSync(file,'utf8'))
 else await db.exec('ALTER TABLE sequences ADD COLUMN reply_stage_id uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL; ALTER TABLE pipeline_leads ADD COLUMN sequence_reply_moved_at timestamptz;') // RED storage only, not behavior.
 await q('insert into buyers(id) values($1),($2)',[buyer,other])
 const pipes=await q("insert into pipelines(buyer_id,name) values($1,'Main'),($1,'Other own'),($2,'Foreign') returning id",[buyer,other])
 const stages=[]
 for(const p of pipes)stages.push(await q("insert into pipeline_stages(pipeline_id,name) values($1,'Follow-up'),($1,'Replied'),($1,'Manual') returning id",[p.id]))
 async function make(mode='legacy',config={},existingLead=null){
  const l=existingLead || (await q("insert into leads(assigned_to,phone) values($1,'15555550999') returning id",[buyer]))[0].id
  if(!existingLead)await q("insert into pipeline_leads(lead_id,pipeline_id,stage_id,moved_at) values($1,$2,$3,'2000-01-01')",[l,pipes[0].id,stages[0][0].id])
  const s=(await q("select * from save_sequence($1,null,$2,'[]')",[buyer,{name:'Fixture',mode,ai_config:{stop_on_stage_exit:false},trigger_stage_id:stages[0][0].id,reply_stage_id:stages[0][1].id,...config}]))[0]
  await q('update sequences set enabled=true where id=$1',[s.id])
  const e=(await q('select * from enroll_sequence($1,$2,$3,now())',[buyer,s.id,l]))[0]
  return {l,s,e}
 }
 const inbound=async(l,{body='Interested',channel='wa',owner=buyer,at=null,sid=null,direction='in'}={})=>{
  if(channel==='sms')return q('insert into sms_messages(lead_id,direction,body,from_phone,to_phone,created_at,twilio_sid) values($1,$2,$3,\'15555550999\',\'15555550100\',coalesce($4::timestamptz,clock_timestamp()),$5) ON CONFLICT DO NOTHING',[l,direction,body,at,sid])
  return q('insert into whatsapp_messages(buyer_id,lead_id,direction,body,from_phone,to_phone,sent_at,wa_message_id) values($1,$2,$3,$4,\'15555550999\',\'15555550100\',coalesce($5::timestamptz,clock_timestamp()),$6) ON CONFLICT DO NOTHING',[owner,l,direction,body,at,sid])
 }
 const card=async(l)=>(await q('select * from pipeline_leads where lead_id=$1',[l]))[0]
 const state=async(e)=>(await q('select * from sequence_enrollments where id=$1',[e.id]))[0]
 return {db,q,pipes,stages,make,inbound,card,state}
}

test('durable outbox retries movement and materialization failures without new inbound',async(t)=>{
 const {db,q,make,inbound,card,state,stages}=await fixture()
 try {
  for(const mode of ['legacy','ai_until_reply'])for(const channel of ['wa','sms'])for(const failure of ['move','queue','timeout'])await t.test(`${mode} ${channel} ${failure}`,async()=>{
   const a=await make(mode)
   const table=failure==='queue'?'sequence_reply_moves':'pipeline_leads'
   await db.exec(`CREATE FUNCTION fail_reply_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture' USING ERRCODE='${failure==='timeout'?'57014':'P0001'}'; END $$; CREATE TRIGGER fail_reply_fixture BEFORE ${failure==='queue'?'INSERT':'UPDATE'} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_reply_fixture();`)
   await inbound(a.l,{channel})
   assert.equal((await state(a.e)).stop_reason,'replied')
   assert.equal((await card(a.l)).stage_id,stages[0][0].id)
   if(failure==='queue')assert.ok((await q('select reply_move_intent from ai_sequence_suppressions where lead_id=$1',[a.l]))[0].reply_move_intent)
   else assert.equal((await q('select status from sequence_reply_moves where lead_id=$1',[a.l]))[0].status,'pending')
   await db.exec(`DROP TRIGGER fail_reply_fixture ON ${table}; DROP FUNCTION fail_reply_fixture();`)
   await q('update sequence_reply_moves set next_attempt_at=clock_timestamp() where lead_id=$1',[a.l])
   await q('select drain_sequence_reply_moves(100)')
   assert.equal((await card(a.l)).stage_id,stages[0][1].id)
   assert.ok((await card(a.l)).sequence_reply_moved_at)
   assert.equal((await state(a.e)).status,'stopped')
   const audit=(await q('select * from sequence_reply_moves where lead_id=$1',[a.l]))[0]
   assert.equal(audit.status,'moved');assert.ok(audit.finished_at)
   await q('select drain_sequence_reply_moves(100)')
   assert.deepEqual((await q('select * from sequence_reply_moves where lead_id=$1',[a.l]))[0],audit)
  })
  for(const role of ['anon','authenticated','service_role']) {
   const allowed=role==='service_role'
   for(const fn of ['drain_sequence_reply_moves(integer)','attempt_sequence_reply_move(uuid)','materialize_sequence_reply_move(uuid,uuid)'])assert.equal((await q("select has_function_privilege($1,$2,'execute') ok",[role,fn]))[0].ok,allowed)
   assert.equal((await q("select has_table_privilege($1,'sequence_reply_moves','select') ok",[role]))[0].ok,allowed)
  }
  assert.equal((await q("select relrowsecurity from pg_class where oid='sequence_reply_moves'::regclass"))[0].relrowsecurity,true)
 }finally{await db.close()}
})

test('reply stage save validates effective partial state and ownership atomically',async()=>{
 const {db,q,make,stages}=await fixture()
 try {
  const {s}=await make()
  assert.equal(s.reply_stage_id,stages[0][1].id)
  assert.equal((await q('select * from save_sequence($1,$2,$3)',[buyer,s.id,{name:'Renamed'}]))[0].reply_stage_id,s.reply_stage_id)
  for(const config of [{reply_stage_id:stages[2][1].id},{trigger_stage_id:stages[2][0].id},{reply_stage_id:'00000000-0000-4000-8000-000000000099'}])await assert.rejects(q('select * from save_sequence($1,$2,$3)',[buyer,s.id,config]),e=>e.code==='42501')
  for(const config of [{reply_stage_id:stages[1][1].id},{trigger_stage_id:stages[1][0].id}])await assert.rejects(q('select * from save_sequence($1,$2,$3)',[buyer,s.id,config]),e=>e.code==='22023')
  assert.equal((await q('select * from sequences where id=$1',[s.id]))[0].trigger_stage_id,stages[0][0].id)
  const both=(await q('select * from save_sequence($1,$2,$3)',[buyer,s.id,{trigger_stage_id:stages[1][0].id,reply_stage_id:stages[1][1].id}]))[0]
  assert.equal(both.reply_stage_id,stages[1][1].id)
  assert.equal((await q('select * from save_sequence($1,$2,$3)',[buyer,s.id,{reply_stage_id:null}]))[0].reply_stage_id,null)
  const old=(await q("select * from save_sequence($1,null,'{\"name\":\"Default\"}','[]')",[buyer]))[0]
  assert.equal(old.reply_stage_id,null)
 }finally{await db.close()}
})
test('commercial inbound moves exactly once in IA/legacy and WA/SMS without rearming destination',async(t)=>{
 const {db,q,make,inbound,card,state,stages}=await fixture()
 try {
  for(const mode of ['legacy','ai_until_reply'])for(const channel of ['wa','sms'])await t.test(mode+' '+channel,async()=>{
   const {l,e}=await make(mode)
   const destination=(await q("insert into sequences(buyer_id,name,trigger_stage_id) values($1,'Destination',$2) returning id",[buyer,stages[0][1].id]))[0]
   await inbound(l,{channel,sid:e.id})
   const moved=await card(l)
   assert.equal(moved.stage_id,stages[0][1].id)
   assert.ok(moved.sequence_reply_moved_at)
   assert.equal((await state(e)).stop_reason,'replied')
   assert.equal((await q('select * from sequence_enrollments where sequence_id=$1',[destination.id])).length,0)
   await inbound(l,{channel,sid:e.id});await inbound(l,{channel})
   assert.deepEqual(await card(l),moved)
   await q('update pipeline_leads set stage_id=$1,moved_at=clock_timestamp() where lead_id=$2',[stages[0][2].id,l])
   assert.equal((await card(l)).sequence_reply_moved_at,null,'manual movement clears automation exclusion')
  })
 }finally{await db.close()}
})
test('no move for disabled option, STOP synonyms, optout, unknown, stopped, stale/outbound, owner mismatch or manual stage change',async(t)=>{
 const {db,q,make,inbound,card,state,stages}=await fixture()
 try {
  for(const kind of ['off','STOP','STOPALL','CANCEL','END','QUIT','optout','unknown','stopped','stale','out','owner','manual','manual-return','removed','foreign-target','missing-card'])await t.test(kind,async()=>{
   const {l,s,e}=await make('legacy',kind==='off'?{reply_stage_id:null}:{})
   if(kind==='optout')await q('update leads set sms_opted_out=true where id=$1',[l])
   if(kind==='unknown')await q("update sequence_enrollments set delivery_status='unknown',status='paused',stop_reason='delivery_unknown' where id=$1",[e.id])
   if(kind==='stopped')await q('select stop_sequence_enrollment($1,$2)',[buyer,e.id])
   if(kind==='manual'||kind==='manual-return')await q('update pipeline_leads set stage_id=$1,moved_at=clock_timestamp() where lead_id=$2',[stages[0][2].id,l])
   if(kind==='manual-return')await q('update pipeline_leads set stage_id=$1,moved_at=clock_timestamp() where lead_id=$2',[stages[0][0].id,l])
   if(kind==='removed')await q('update sequences set reply_stage_id=null where id=$1',[s.id])
   if(kind==='foreign-target')await q('update sequences set reply_stage_id=$1 where id=$2',[stages[2][1].id,s.id])
   if(kind==='missing-card')await q('delete from pipeline_leads where lead_id=$1',[l])
   const before=await card(l)
   await inbound(l,{body:['STOP','STOPALL','CANCEL','END','QUIT'].includes(kind)?kind:'Interested',direction:kind==='out'?'out':'in',owner:kind==='owner'?other:buyer,at:kind==='stale'?'1999-01-01':null})
   assert.deepEqual(await card(l),before)
   if(['STOP','STOPALL','CANCEL','END','QUIT'].includes(kind))assert.equal((await state(e)).stop_reason,'optout')
   if(['off','removed','foreign-target'].includes(kind))assert.equal((await state(e)).stop_reason,'replied')
  })
 }finally{await db.close()}
})
test('manual enrollment only moves existing destination-pipeline card; conflicting candidates abstain, identical converge',async()=>{
 const {db,q,make,inbound,card,state,stages}=await fixture()
 try {
  for(const same of [false,true]){
   const first=await make('legacy')
   const second=await make('legacy',{reply_stage_id:stages[0][same?1:2].id},first.l)
   await inbound(first.l)
   assert.equal((await card(first.l)).stage_id,stages[0][same?1:0].id)
   assert.equal((await state(first.e)).stop_reason,'replied');assert.equal((await state(second.e)).stop_reason,'replied')
  }
  for(const local of [false,true]){
   const a=await make('legacy',{trigger_stage_id:null,reply_stage_id:stages[local?0:1][1].id})
   await inbound(a.l)
   assert.equal((await card(a.l)).stage_id,stages[0][local?1:0].id)
   assert.equal((await q('select * from pipeline_leads where lead_id=$1',[a.l])).length,1)
  }
 }finally{await db.close()}
})
test('move failure rolls back only movement, never inbound, suppression or stop; deleted target is harmless',async()=>{
 const {db,q,make,inbound,card,state,stages}=await fixture()
 try{
  const a=await make()
  await db.exec("CREATE FUNCTION reject_move() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic target failure'; END $$; CREATE TRIGGER fail_move BEFORE UPDATE ON pipeline_leads FOR EACH ROW EXECUTE FUNCTION reject_move();")
  await inbound(a.l)
  assert.equal((await state(a.e)).stop_reason,'replied')
  assert.equal((await card(a.l)).stage_id,stages[0][0].id)
  assert.equal((await q('select reason from ai_sequence_suppressions where lead_id=$1',[a.l]))[0].reason,'replied')
  assert.equal((await q('select * from whatsapp_messages where lead_id=$1',[a.l])).length,1)
  await db.exec('DROP TRIGGER fail_move ON pipeline_leads')
  const b=await make()
  await q('delete from pipeline_stages where id=$1',[stages[0][1].id])
  await inbound(b.l)
  assert.equal((await state(b.e)).stop_reason,'replied')
  assert.equal((await card(b.l)).stage_id,stages[0][0].id)
 }finally{await db.close()}
})
test('same phone never crosses lead/owner boundary, including SMS; reply function privileges remain closed',async()=>{
 const {db,q,make,inbound,card,state,stages}=await fixture()
 try{
  const a=await make(),b=await make()
  const foreignLead=(await q("insert into leads(assigned_to,phone) values($1,'15555550999') returning id",[other]))[0].id
  const foreignSeq=(await q("select * from save_sequence($1,null,$2,'[]')",[other,{name:'Other owner',trigger_stage_id:stages[2][0].id,reply_stage_id:stages[2][1].id}]))[0]
  await q("insert into pipeline_leads(lead_id,pipeline_id,stage_id,moved_at) select $1,pipeline_id,id,'2000-01-01' from pipeline_stages where id=$2",[foreignLead,stages[2][0].id])
  const foreignEnrollment=(await q('select * from enroll_sequence($1,$2,$3,now())',[other,foreignSeq.id,foreignLead]))[0]
  await inbound(a.l,{channel:'sms'})
  assert.equal((await card(a.l)).stage_id,stages[0][1].id)
  assert.equal((await card(b.l)).stage_id,stages[0][0].id)
  assert.equal((await state(b.e)).status,'active')
  assert.equal((await card(foreignLead)).stage_id,stages[2][0].id)
  assert.equal((await state(foreignEnrollment)).status,'active')
  await inbound(foreignLead,{channel:'sms'})
  assert.equal((await card(foreignLead)).stage_id,stages[2][1].id)
  assert.equal((await state(foreignEnrollment)).stop_reason,'replied')
  assert.equal((await state(b.e)).status,'active')
  for(const role of ['anon','authenticated','service_role'])assert.equal((await q("select has_function_privilege($1,'public.stop_ai_sequence_on_inbound()','execute') ok",[role]))[0].ok,role==='service_role')
 }finally{await db.close()}
})
