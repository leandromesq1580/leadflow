import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { runAIEnrollment, type AIEnginePorts, type AIEnrollment } from '../src/lib/ai-sequence-engine'
import { defaultAIConfig } from '../src/lib/ai-sequence-config'
import { isWonStage } from '../src/lib/lead-stage'
const buyer = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const lead = '00000000-0000-4000-8000-000000000003'
export async function database() {
  const db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select null::uuid';
CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'select gen_random_uuid()';
CREATE TABLE buyers(id uuid primary key, auth_user_id uuid, is_active boolean default true);
CREATE TABLE leads(id uuid primary key, assigned_to uuid, assigned_to_member uuid, archived boolean default false, contract_closed boolean default false, sms_opted_out boolean default false, lead_language text default 'pt', phone text);
CREATE TABLE pipelines(id uuid primary key, buyer_id uuid);
CREATE TABLE pipeline_stages(id uuid primary key, pipeline_id uuid, name text);
CREATE TABLE pipeline_leads(id uuid primary key, lead_id uuid, pipeline_id uuid, stage_id uuid);
CREATE TABLE templates(id uuid primary key, buyer_id uuid, is_system boolean);
CREATE TABLE sms_messages(id uuid primary key default gen_random_uuid(),lead_id uuid,direction text,body text,created_at timestamptz default now());`)
  const base = readFileSync('supabase/migrations/006_inbox_sequences_ai_push.sql', 'utf8')
  await db.exec(base.slice(0, base.indexOf('-- AI LEAD SCORING')))
  await db.exec(readFileSync('supabase/migrations/052_ai_sequences_until_reply.sql', 'utf8'))
  await db.query('insert into buyers(id) values($1),($2)', [buyer, other])
  await db.query('insert into leads(id,assigned_to) values($1,$2)', [lead,buyer])
  return db
}
const ai = { goal:'call', brief:'', initial_delay_minutes:0,repeat_minutes:1440,timezone:'America/New_York',days:[0,1,2,3,4,5,6],start:'00:00',end:'23:59',stop_on_stage_exit:true,booking_url:'' }
async function enroll(db: PGlite) {
 const {rows:[s]}=await db.query<{id:string}>('select * from save_sequence($1,null,$2,$3)', [buyer,{name:'AI',mode:'ai_until_reply',ai_config:ai},[]])
 assert.equal((await db.query<{enabled:boolean}>('select enabled from sequences where id=$1',[s.id])).rows[0].enabled,false)
 await db.query('update sequences set enabled=true where id=$1',[s.id])
 return (await db.query<{id:string}>('select * from enroll_sequence($1,$2,$3,$4)',[buyer,s.id,lead,new Date(0).toISOString()])).rows[0]
}
test('SQL preserves distinct optional instructions and presentations per sequence and rejects another buyer editing them',async()=>{
 const db=await database()
 try{
  const configs=[{...ai,instructions:'1. Propósito: Explique como funciona.\nNão peça dados de saúde. '.repeat(8),presentation:'Oi, sou Ana, agente de life insurance.'},{...ai,instructions:'Tom direto e acolhedor.',presentation:'Prefiro uma abordagem direta.'},ai]
  const ids:string[]=[]
  for(const [index,config] of configs.entries()){
   const {rows:[saved]}=await db.query<{id:string;ai_config:typeof config;enabled:boolean}>('select * from save_sequence($1,null,$2,$3)',[buyer,{name:`Fixture ${index}`,mode:'ai_until_reply',ai_config:config},[]])
   ids.push(saved.id)
   assert.deepEqual(saved.ai_config,config);assert.equal(saved.enabled,false)
  }
  const edited={...ai,instructions:'Oriente com clareza, sem pressão.',presentation:'Quero começar com uma pergunta simples.'}
  await db.query('select * from save_sequence($1,$2,$3,null)',[buyer,ids[0],{ai_config:edited}])
  await assert.rejects(db.query('select * from save_sequence($1,$2,$3,null)',[other,ids[0],{ai_config:configs[1]}]),/sequence_not_owned/)
  for(const [index,id] of ids.entries()){
   const {rows:[row]}=await db.query<{ai_config:typeof ai}>('select ai_config from sequences where id=$1',[id])
   assert.deepEqual(row.ai_config,index===0?edited:configs[index])
  }
  assert.equal((await db.query('select * from sequence_enrollments')).rows.length,0)
 }finally{await db.close()}
})

test('AI claim is exclusive, inbound media stops guard and cannot re-enroll', async()=>{
 const db=await database()
 try {
  const e=await enroll(db)
  const first=await db.query('select * from claim_ai_sequence($1)',[e.id])
  assert.equal(first.rows.length,1)
  assert.equal((await db.query('select * from claim_ai_sequence($1)',[e.id])).rows.length,0)
  await db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,media_type) values($1,$2,'in','fixture','fixture','audio')",[other,lead])
  assert.equal((await db.query<{status:string}>('select status from sequence_enrollments')).rows[0].status,'active')
  await db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,media_type) values($1,$2,'in','fixture','fixture','audio')",[buyer,lead])
  const state=(await db.query<{status:string,stop_reason:string}>('select * from sequence_enrollments')).rows[0]
  assert.equal(state.status,'stopped'); assert.equal(state.stop_reason,'replied')
  assert.equal((await db.query('select * from begin_ai_send($1,$2,$3)',[e.id,(first.rows[0] as {lease_token:string}).lease_token,'fixture'])).rows.length,0)
  await assert.rejects(enroll(db))
 } finally {await db.close()}
})
test('outbound/read receipts do not stop; delivery ambiguity pauses without advancing',async()=>{
 const db=await database()
 try {
  const e=await enroll(db)
  await db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,status) values($1,$2,'out','fixture','fixture','read')",[buyer,lead])
  const {rows:[c]}=await db.query<{lease_token:string}>('select * from claim_ai_sequence($1)',[e.id])
  assert.equal((await db.query('select * from begin_ai_send($1,$2,$3)',[e.id,c.lease_token,'body'])).rows.length,1)
  await db.query("update sequence_enrollments set lease_until=now()-interval '1 second'")
  assert.equal((await db.query('select * from claim_ai_sequence($1)',[e.id])).rows.length,0)
  const {rows:[state]}=await db.query<{status:string,current_step:number,stop_reason:string}>('select * from sequence_enrollments')
  assert.equal(state.status,'paused');assert.equal(state.current_step,0);assert.equal(state.stop_reason,'delivery_unknown')
 }finally{await db.close()}
})
test('confirmed delivery advances once; failures retain step and manual stop is durable',async()=>{
 const db=await database()
 try{
  const e=await enroll(db)
  const {rows:[c]}=await db.query<{lease_token:string}>('select * from claim_ai_sequence($1)',[e.id])
  await db.query('select * from begin_ai_send($1,$2,$3)',[e.id,c.lease_token,'body'])
  const params=[e.id,c.lease_token,'wa-fixture','0:0',new Date(Date.now()+86400000).toISOString(),'from','to']
  await db.query('select finish_ai_send($1,$2,$3,$4,$5,$6,$7)',params)
  await db.query('select finish_ai_send($1,$2,$3,$4,$5,$6,$7)',params)
  assert.equal((await db.query<{current_step:number}>('select * from sequence_enrollments')).rows[0].current_step,1)
  assert.equal((await db.query('select * from whatsapp_messages')).rows.length,1)
  await db.query('select stop_sequence_enrollment($1,$2)',[buyer,e.id])
  await assert.rejects(enroll(db))
 }finally{await db.close()}
})
test('engine with real SQL: concurrency, reply during generation, offline, unavailable and timeout',async()=>{
 for(const scenario of ['success','reply','offline','generation','timeout']){
  const db=await database()
  try{
   const e=await enroll(db);let sends=0
   const ports:AIEnginePorts={
    now:()=>new Date('2026-09-29T15:00:00Z'),
    claim:async id=>(await db.query<AIEnrollment>('select * from claim_ai_sequence($1)',[id])).rows[0] || null,
    context:async()=>({config:defaultAIConfig,lead:{lead_language:'pt'},phone:'fixture'}),
    ready:async()=>{if(scenario==='offline')throw new Error('offline')},
    generate:async()=>{if(scenario==='generation')throw new Error('unavailable');if(scenario==='reply')await db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone) values($1,$2,'in','fixture','fixture')",[buyer,lead]);return {body:'Fixture',choice:'0:0'}},
    begin:async (c,body)=>(await db.query('select * from begin_ai_send($1,$2,$3)',[c.id,c.lease_token,body])).rows.length>0,
    send:async()=>{sends++;if(scenario==='timeout')throw new Error('timeout');return {id:'wa-fixture',from:'fixture',to:'fixture'}},
    finish:async(c,sent,choice,next)=>{await db.query('select finish_ai_send($1,$2,$3,$4,$5,$6,$7)',[c.id,c.lease_token,sent.id,choice,next.toISOString(),sent.from,sent.to])},
    defer:async(c,reason,next,unknown)=>{await db.query('select defer_ai_sequence($1,$2,$3,$4,$5)',[c.id,c.lease_token,reason,next.toISOString(),unknown])},
   }
   await Promise.all([runAIEnrollment(e.id,ports),runAIEnrollment(e.id,ports)])
   const {rows:[state]}=await db.query<{status:string,current_step:number,delivery_status:string,attempts:number}>('select * from sequence_enrollments')
   assert.equal(sends,['success','timeout'].includes(scenario)?1:0)
   assert.equal(state.current_step,scenario==='success'?1:0)
   if(scenario==='reply')assert.equal(state.status,'stopped')
   if(scenario==='timeout'){assert.equal(state.status,'paused');assert.equal(state.delivery_status,'unknown')}
  }finally{await db.close()}
 }
})
test('transfer, archive, SMS optout, inactive buyer and disabling sequence stop immediately',async()=>{
 for(const [sql,reason] of [
  [`update leads set assigned_to='${other}'`,'ownership_changed'],
  ['update leads set archived=true','archived'],
  ['update leads set sms_opted_out=true','optout'],
  ['update leads set contract_closed=true','sold'],
  ['update buyers set is_active=false','buyer_inactive'],
  ['update sequences set enabled=false','sequence_disabled'],
 ]){
  const db=await database()
  try{
   await enroll(db);await db.exec(sql)
   const {rows:[state]}=await db.query<{status:string,stop_reason:string}>('select * from sequence_enrollments')
   assert.equal(state.stop_reason,reason);assert.equal(state.status,reason==='sold'?'completed':'stopped')
  }finally{await db.close()}
 }
})
test('SQL won classification matches TS and stage exit respects opt-in setting',async()=>{
 const db=await database()
 try{
  for(const stage of ['Fechado/Ganho','Issued','Not Approved','Não aprovado','Cancelado','won','Unwon','New','Cadastro Emitido','Cerrado/Ganado']){
   assert.equal((await db.query<{won:boolean}>('select ai_sequence_won($1) won',[stage])).rows[0].won,isWonStage(stage),stage)
  }
  const e=await enroll(db)
  await db.query('insert into pipelines values($1,$2)',[lead,buyer])
  await db.query("insert into pipeline_stages values($1,$2,'Novo'),($3,$2,'Em atendimento')",[buyer,lead,other])
  await db.query('insert into pipeline_leads values($1,$1,$1,$2)',[lead,buyer])
  await db.query('update sequences set trigger_stage_id=$1',[buyer])
  await db.query('update pipeline_leads set stage_id=$1',[other])
  assert.equal((await db.query<{stop_reason:string}>('select stop_reason from sequence_enrollments where id=$1',[e.id])).rows[0].stop_reason,'stage_exit')
 }finally{await db.close()}
})
test('SMS inbound stops without buyer_id; mismatched buyer optout cannot block another owner',async()=>{
 const db=await database()
 try{
  await enroll(db)
  await db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body) values($1,$2,'in','fixture','fixture','STOP')",[other,lead])
  assert.equal((await db.query('select * from ai_sequence_suppressions')).rows.length,0)
  await db.query("insert into sms_messages(lead_id,direction,body) values($1,'in','Olá')",[lead])
  assert.equal((await db.query<{stop_reason:string}>('select stop_reason from sequence_enrollments')).rows[0].stop_reason,'replied')
 }finally{await db.close()}
})
test('delivery finalization tolerates same-owner outbound webhook race and clears retry reason',async()=>{
 const db=await database()
 try{
  const e=await enroll(db)
  const {rows:[c]}=await db.query<{lease_token:string}>('select * from claim_ai_sequence($1)',[e.id])
  await db.query("update sequence_enrollments set stop_reason='generation_unavailable'")
  await db.query('select * from begin_ai_send($1,$2,$3)',[e.id,c.lease_token,'body'])
  await db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body,wa_message_id) values($1,$2,'out','fixture','fixture','body','wa-race')",[buyer,lead])
  await db.query('select finish_ai_send($1,$2,$3,$4,$5,$6,$7)',[e.id,c.lease_token,'wa-race','0:0',new Date(Date.now()+86400000).toISOString(),'fixture','fixture'])
  assert.equal((await db.query('select * from whatsapp_messages')).rows.length,1)
  const {rows:[state]}=await db.query<{current_step:number,stop_reason:string|null}>('select * from sequence_enrollments')
  assert.equal(state.current_step,1);assert.equal(state.stop_reason,null)
 }finally{await db.close()}
})
test('ambiguous delivery blocks re-entry even after deleting its sequence',async()=>{
 const db=await database()
 try{
  const e=await enroll(db)
  const {rows:[c]}=await db.query<{lease_token:string}>('select * from claim_ai_sequence($1)',[e.id])
  await db.query('select * from begin_ai_send($1,$2,$3)',[e.id,c.lease_token,'body'])
  await db.query('select defer_ai_sequence($1,$2,$3,$4,true)',[e.id,c.lease_token,'delivery_unknown',new Date().toISOString()])
  await db.exec('delete from sequences')
  await assert.rejects(enroll(db))
 }finally{await db.close()}
})
test('recent generated choices retain chronological last three, not old repetitions',async()=>{
 const db=await database()
 try{
  const e=await enroll(db)
  for(let n=0;n<5;n++){
   await db.query("update sequence_enrollments set next_run_at=now()-interval '1 minute'")
   const {rows:[c]}=await db.query<{lease_token:string}>('select * from claim_ai_sequence($1)',[e.id])
   await db.query('select * from begin_ai_send($1,$2,$3)',[e.id,c.lease_token,'body'])
   await db.query('select finish_ai_send($1,$2,$3,$4,$5,$6,$7)',[e.id,c.lease_token,`wa-${n}`,String(n),new Date(Date.now()+86400000).toISOString(),'fixture','fixture'])
  }
  assert.deepEqual((await db.query<{recent_choices:string[]}>('select recent_choices from sequence_enrollments')).rows[0].recent_choices,['2','3','4'])
 }finally{await db.close()}
})
test('SQL privileges, capped retry and unique active prospect are enforced',async()=>{
 const db=await database()
 try{
  const e=await enroll(db)
  await assert.rejects(enroll(db),/duplicate key/)
  for(const name of ['claim_ai_sequence(uuid)','begin_ai_send(uuid,uuid,text)','enroll_sequence(uuid,uuid,uuid,timestamptz)','save_sequence(uuid,uuid,jsonb,jsonb)']){
   const {rows:[r]}=await db.query<{auth:boolean,service:boolean}>("select has_function_privilege('authenticated',$1,'EXECUTE') auth,has_function_privilege('service_role',$1,'EXECUTE') service",[`public.${name}`])
   assert.equal(r.auth,false);assert.equal(r.service,true)
  }
  assert.equal((await db.query<{allowed:boolean}>("select has_table_privilege('authenticated','sequence_enrollments','UPDATE') allowed")).rows[0].allowed,false)
  for(let n=0;n<3;n++){
   const {rows:[c]}=await db.query<{lease_token:string}>('select * from claim_ai_sequence($1)',[e.id])
   assert.ok(c)
   await db.query('select defer_ai_sequence($1,$2,$3,$4,false)',[e.id,c.lease_token,'generation_unavailable',new Date(0).toISOString()])
  }
  assert.equal((await db.query('select * from claim_ai_sequence($1)',[e.id])).rows.length,0)
  const {rows:[state]}=await db.query<{status:string,current_step:number,attempts:number}>('select * from sequence_enrollments where id=$1',[e.id])
  assert.equal(state.status,'paused');assert.equal(state.current_step,0);assert.equal(state.attempts,3)
 }finally{await db.close()}
})
test('optional stage exit false keeps prospect active but won stage always completes',async()=>{
 const db=await database()
 try{
  const e=await enroll(db)
  await db.query('insert into pipelines values($1,$2)',[lead,buyer])
  await db.query("insert into pipeline_stages values($1,$2,'Novo'),($3,$2,'Em atendimento'),($2,$2,'Fechado/Ganho')",[buyer,lead,other])
  await db.query('insert into pipeline_leads values($1,$1,$1,$2)',[lead,buyer])
  await db.query('update sequences set trigger_stage_id=$1,ai_config=$2',[buyer,{...ai,stop_on_stage_exit:false}])
  await db.query('update pipeline_leads set stage_id=$1',[other])
  assert.equal((await db.query<{status:string}>('select status from sequence_enrollments where id=$1',[e.id])).rows[0].status,'active')
  await db.query('update pipeline_leads set stage_id=$1',[lead])
  assert.equal((await db.query<{status:string}>('select status from sequence_enrollments where id=$1',[e.id])).rows[0].status,'completed')
 }finally{await db.close()}
})
test('historical conversation and delayed pre-enrollment webhooks allow recovery; reply boundary persists',async()=>{
 for(const channel of ['whatsapp','sms']){
  const db=await database()
  try{
   const inbound=async(body:string,time:string)=>channel==='whatsapp'
    ? db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body,sent_at) values($1,$2,'in','fixture','fixture',$3,$4)",[buyer,lead,body,time])
    : db.query("insert into sms_messages(lead_id,direction,body,created_at) values($1,'in',$2,$3)",[lead,body,time])
   await inbound('old conversation','2020-01-01T00:00:00Z')
   assert.equal((await db.query('select * from ai_sequence_suppressions')).rows.length,0)
   const e=await enroll(db)
   await inbound('delayed webhook','2020-01-02T00:00:00Z')
   const {rows:[c]}=await db.query<{lease_token:string,enrolled_at:Date}>('select * from claim_ai_sequence($1)',[e.id])
   assert.ok(c)
   await db.query("update sequence_enrollments set status='paused' where id=$1",[e.id])
   const {rows:[boundary]}=await db.query<{at:string}>('select enrolled_at::text as at from sequence_enrollments where id=$1',[e.id])
   await inbound('new reply',boundary.at)
   assert.equal((await db.query<{stop_reason:string}>('select stop_reason from sequence_enrollments')).rows[0].stop_reason,'replied')
   await db.exec('delete from sequences')
   await assert.rejects(enroll(db),/enrollment_blocked:replied/)
  }finally{await db.close()}
 }
})
test('optout without enrollment remains persistent regardless of event age',async()=>{
 const db=await database()
 try{
  await db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body,sent_at) values($1,$2,'in','fixture','fixture','STOP','2020-01-01')",[buyer,lead])
  await assert.rejects(enroll(db),/enrollment_blocked:optout/)
 }finally{await db.close()}
})
test('delete during transport preserves a tombstone before either timeout or finish',async()=>{
 for(const outcome of ['timeout','finish']){
  const db=await database()
  try{
   const e=await enroll(db)
   const {rows:[c]}=await db.query<{lease_token:string}>('select * from claim_ai_sequence($1)',[e.id])
   await db.query('select * from begin_ai_send($1,$2,$3)',[e.id,c.lease_token,'body'])
   await db.exec('delete from sequences')
   assert.equal((await db.query<{reason:string}>('select reason from ai_sequence_suppressions')).rows[0]?.reason,'delivery_unknown')
   if(outcome==='timeout')await db.query('select defer_ai_sequence($1,$2,$3,$4,true)',[e.id,c.lease_token,'delivery_unknown',new Date().toISOString()])
   else assert.equal((await db.query<{ok:boolean}>('select finish_ai_send($1,$2,$3,$4,$5,$6,$7) ok',[e.id,c.lease_token,'wa-deleted','0:0',new Date().toISOString(),'fixture','fixture'])).rows[0].ok,false)
   await assert.rejects(enroll(db),/enrollment_blocked:delivery_unknown/)
  }finally{await db.close()}
 }
})
test('delete before begin prevents transport without creating an ambiguous delivery',async()=>{
 const db=await database()
 try{
  const e=await enroll(db)
  const {rows:[c]}=await db.query<{lease_token:string}>('select * from claim_ai_sequence($1)',[e.id])
  await db.exec('delete from sequences')
  assert.equal((await db.query('select * from begin_ai_send($1,$2,$3)',[e.id,c.lease_token,'body'])).rows.length,0)
  assert.equal((await db.query('select * from ai_sequence_suppressions')).rows.length,0)
  assert.ok(await enroll(db))
 }finally{await db.close()}
})
test('third claim outside window only defers and refunds the claim attempt',async()=>{
 const db=await database()
 try{
  const e=await enroll(db)
  for(let n=0;n<2;n++){
   const {rows:[c]}=await db.query<{lease_token:string}>('select * from claim_ai_sequence($1)',[e.id])
   await db.query('select defer_ai_sequence($1,$2,$3,$4,false)',[e.id,c.lease_token,'generation_unavailable',new Date(0).toISOString()])
  }
  const {rows:[c]}=await db.query<{lease_token:string}>('select * from claim_ai_sequence($1)',[e.id])
  await db.query('select defer_ai_sequence($1,$2,$3,$4,false)',[e.id,c.lease_token,'outside_window',new Date(0).toISOString()])
  const {rows:[state]}=await db.query<{status:string,attempts:number}>('select status,attempts from sequence_enrollments')
  assert.deepEqual(state,{status:'active',attempts:2})
  assert.equal((await db.query('select * from claim_ai_sequence($1)',[e.id])).rows.length,1)
 }finally{await db.close()}
})
test('old or mismatched existing ACK cannot advance and engine quarantines without retry',async()=>{
 for(const evidence of ['old','wrong_body']){
  const db=await database()
  try{
   const e=await enroll(db);let sends=0
   const ports:AIEnginePorts={
    now:()=>new Date('2026-09-29T15:00:00Z'),
    claim:async id=>(await db.query<AIEnrollment>('select * from claim_ai_sequence($1)',[id])).rows[0]||null,
    context:async()=>({config:defaultAIConfig,lead:{lead_language:'pt'},phone:'fixture'}),
    ready:async()=>{},generate:async()=>({body:'current body',choice:'0:0'}),
    begin:async(c,body)=>(await db.query('select * from begin_ai_send($1,$2,$3)',[c.id,c.lease_token,body])).rows.length>0,
    send:async()=>{
     sends++
     await db.query("insert into whatsapp_messages(buyer_id,lead_id,direction,from_phone,to_phone,body,wa_message_id,sent_at) values($1,$2,'out','fixture','fixture',$3,'stale-ack',CASE WHEN $4 THEN now()-interval '1 day' ELSE now() END)",[buyer,lead,evidence==='old'?'current body':'unrelated body',evidence==='old'])
     return {id:'stale-ack',from:'fixture',to:'fixture'}
    },
    finish:async(c,sent,choice,next)=>{await db.query('select finish_ai_send($1,$2,$3,$4,$5,$6,$7)',[c.id,c.lease_token,sent.id,choice,next.toISOString(),sent.from,sent.to])},
    defer:async(c,reason,next,unknown)=>{await db.query('select defer_ai_sequence($1,$2,$3,$4,$5)',[c.id,c.lease_token,reason,next.toISOString(),unknown])},
   }
   assert.equal(await runAIEnrollment(e.id,ports),false)
   const {rows:[state]}=await db.query<{status:string,delivery_status:string,current_step:number}>('select status,delivery_status,current_step from sequence_enrollments')
   assert.deepEqual(state,{status:'paused',delivery_status:'unknown',current_step:0})
   assert.equal(await runAIEnrollment(e.id,ports),false);assert.equal(sends,1)
   await assert.rejects(enroll(db),/enrollment_blocked:delivery_unknown/)
  }finally{await db.close()}
 }
})
const payload = { name: 'Fixture', mode: 'legacy', enabled: true }
test('SQL save is atomic and rejects cross-buyer templates without destroying steps', async () => {
  const db = await database()
  try {
    const { rows: [s] } = await db.query<{id:string}>('select * from save_sequence($1,null,$2,$3)', [buyer,payload,[{step_type:'wait',delay_hours:1}]])
    await db.query('insert into templates values($1,$2,false)', [lead,other])
    await assert.rejects(db.query('select * from save_sequence($1,$2,$3,$4)', [buyer,s.id,{name:'Changed'},[{template_id:lead,step_type:'send_template',delay_hours:0}]]))
    assert.equal((await db.query<{name:string}>('select name from sequences')).rows[0].name, 'Fixture')
    assert.equal((await db.query('select * from sequence_steps')).rows.length, 1)
    await assert.rejects(db.query('select * from save_sequence($1,$2,$3,null)', [other,s.id,{name:'Stolen'}]))
  } finally { await db.close() }
})
