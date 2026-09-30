/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS node:test harness; no application or environment imports. */
const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync, existsSync } = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const buyer='00000000-0000-4000-8000-000000000001'
const other='00000000-0000-4000-8000-000000000002'
const lead='00000000-0000-4000-8000-000000000003'
const migration='supabase/migrations/053_ai_suppression_resolution.sql'
async function fixture() {
 const db=new PGlite()
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select null::uuid';
 CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'select gen_random_uuid()';
 CREATE TABLE buyers(id uuid primary key, auth_user_id uuid, is_active boolean default true);
 CREATE TABLE leads(id uuid primary key, assigned_to uuid, assigned_to_member uuid, archived boolean default false, contract_closed boolean default false, sms_opted_out boolean default false);
 CREATE TABLE pipelines(id uuid primary key,buyer_id uuid);
 CREATE TABLE pipeline_stages(id uuid primary key,pipeline_id uuid,name text);
 CREATE TABLE pipeline_leads(id uuid primary key,lead_id uuid,pipeline_id uuid,stage_id uuid);
 CREATE TABLE templates(id uuid primary key,buyer_id uuid,is_system boolean);
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
 await db.query("insert into ai_sequence_suppressions(buyer_id,lead_id,reason) values($1,$2,'delivery_unknown')",[buyer,lead])
 assert.equal(await block(),'delivery_unknown')
 await db.exec('update ai_sequence_suppressions set resolved_at=now()')
 return {db,s,e,block}
}
test('resolved unknown preserves row and enrollment, and only removes that guard',async()=>{
 const {db,block}=await fixture()
 try {
  const before=(await db.query('select * from sequence_enrollments')).rows
  assert.equal(await block(),null)
  assert.deepEqual((await db.query('select * from sequence_enrollments')).rows,before)
  const rows=(await db.query('select * from ai_sequence_suppressions')).rows
  assert.equal(rows.length,1);assert.equal(rows[0].reason,'delivery_unknown');assert.ok(rows[0].resolved_at)
  for(const reason of ['manual','replied','optout']) {
   await db.query('update ai_sequence_suppressions set reason=$1',[reason])
   await db.exec('update ai_sequence_suppressions set resolved_at=now()')
   assert.equal(await block(),reason)
  }
 } finally {await db.close()}
})

for(const event of ['defer','expired_claim','manual','wa_reply','wa_optout','sms_reply','sms_optout']) {
 test(`new ${event} rearms a resolved unknown`,async()=>{
  const {db,e,block}=await fixture()
  try {
   const old=(await db.query('select created_at from ai_sequence_suppressions')).rows[0].created_at
   assert.equal(await block(),null)
   if(event==='defer'||event==='expired_claim') {
    const {rows:[c]}=await db.query('select * from claim_ai_sequence($1)',[e.id])
    await db.query('select * from begin_ai_send($1,$2,$3)',[e.id,c.lease_token,'fixture'])
    if(event==='defer') await db.query("select defer_ai_sequence($1,$2,'delivery_unknown',now(),true)",[e.id,c.lease_token])
    else {await db.exec("update sequence_enrollments set lease_until=now()-interval '1 second'");await db.query('select * from claim_ai_sequence($1)',[e.id])}
   } else if(event==='manual') await db.query('select stop_sequence_enrollment($1,$2)',[buyer,e.id])
   else if(event.startsWith('wa')) await db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body) values($1,$2,'in','fixture','fixture',$3)",[buyer,lead,event.endsWith('optout')?'STOP':'Hi'])
   else await db.query("insert into sms_messages(lead_id,direction,body) values($1,'in',$2)",[lead,event.endsWith('optout')?'STOP':'Hi'])
   const rows=(await db.query('select * from ai_sequence_suppressions')).rows
   assert.equal(rows.length,1);assert.deepEqual(rows[0].created_at,old)
   assert.equal(rows[0].resolved_at,null)
   assert.ok(await block())
   await assert.rejects(db.query("select * from enroll_sequence($1,$2,$3,now())",[buyer,e.sequence_id,lead]),/enrollment_blocked/)
  }finally{await db.close()}
 })
}
test('resolved unknown preserves ownership and all independent safety guards',async()=>{
 const {db,block,e}=await fixture()
 try {
  for(const body of ['Hi','STOP']) await db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body) values($1,$2,'in','fixture','fixture',$3)",[other,lead,body])
  assert.equal(await block(),null)
  for(const [sql,reason] of [
   [`update leads set assigned_to='${other}'`,'ownership_changed'],
   [`update leads set assigned_to_member='${other}'`,'ownership_changed'],
   ['update leads set archived=true','archived'],
   ['update leads set contract_closed=true','sold'],
   ['update leads set sms_opted_out=true','optout'],
   ['update buyers set is_active=false','buyer_inactive'],
   ['update sequences set enabled=false','sequence_disabled']]) {
   await db.exec('BEGIN');await db.exec(sql);assert.equal(await block(),reason);await db.exec('ROLLBACK')
  }
  await db.query("update sequence_enrollments set status='paused',delivery_status='unknown' where id=$1",[e.id])
  await db.exec('update ai_sequence_suppressions set resolved_at=now()')
  assert.equal((await db.query('select * from claim_ai_sequence($1)',[e.id])).rows.length,0)
  assert.equal((await db.query('select current_step from sequence_enrollments')).rows[0].current_step,0)
 }finally{await db.close()}
})
