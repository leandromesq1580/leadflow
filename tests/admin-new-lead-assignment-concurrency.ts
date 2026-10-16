// Real independent sessions; private local cluster; no TCP, .env or external IO.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { schemaSQL, uuid } from './admin-new-lead-assignment-fixture'
const root=process.env.TMPDIR
assert.ok(root?.startsWith('/home/hermes/.hermes/profiles/lead4pro/cache/scratch'))
const run=mkdtempSync(`${root}/anpg-`), socket=`${run}/s`;mkdirSync(socket)
const pkg='/home/hermes/.hermes/profiles/lead4pro/cache/scratch/ecpg/pkg'
const bin=`${pkg}/usr/lib/postgresql/16/bin`
const env: NodeJS.ProcessEnv={PATH:'/usr/bin:/bin',HOME:'/home/hermes',LANG:'C.UTF-8',NODE_ENV:'test'}
const log=(name:string,data:unknown='')=>console.log(new Date().toISOString(),name,JSON.stringify(data))
const cmd=(file:string,args:string[])=>execFileSync(file,args,{env,encoding:'utf8',timeout:30000})
const psql=(sql:string,db='postgres')=>cmd('/usr/bin/psql',['-X','-h',socket,'-p','55493','-U','fixture','-d',db,'-v','ON_ERROR_STOP=1','-At','-c',sql]).trim()
let started=false
const call=(source=41,buyer=2,request=91)=>`select admin_assign_lead_as_new('${uuid(11)}','${uuid(source)}','${uuid(buyer)}','${uuid(request)}')`
const background=(sql:string,db:string,holdSeconds=2)=>{
 const proc=spawn('/usr/bin/psql',['-X','-h',socket,'-p','55493','-U','fixture','-d',db,'-v','ON_ERROR_STOP=1','-At','-c',`set application_name='redelivery_blocker';begin;${sql};select pg_sleep(${holdSeconds});commit;`],{env})
 let output='';proc.stdout.on('data',d=>output+=d);proc.stderr.on('data',d=>output+=d)
 const done=new Promise<void>((resolve,reject)=>proc.on('exit',code=>code===0?resolve():reject(new Error(output))))
 return {done}
}
const wait=async(db:string)=>{for(let i=0;i<80;i++){if(psql("select count(*) from pg_stat_activity where application_name='redelivery_blocker' and wait_event='PgSleep'",db)==='1')return;await new Promise(r=>setTimeout(r,20))}throw new Error('barrier timeout')}
async function main(){
try{
 log('init',run)
 log('initdb',cmd(`${bin}/initdb`,['-D',`${run}/data`,'-L',`${pkg}/usr/share/postgresql/16`,'-U','fixture','-A','trust','--no-locale']))
 log('start',cmd(`${bin}/pg_ctl`,['-D',`${run}/data`,'-l',`${run}/postgres.log`,'-o',`-k ${socket} -p 55493 -c listen_addresses='' -c statement_timeout=10000`,'-w','start']));started=true
 writeFileSync(`${run}/schema.sql`,schemaSQL())
 cmd('/usr/bin/psql',['-X','-h',socket,'-p','55493','-U','fixture','-d','postgres','-v','ON_ERROR_STOP=1','-f',`${run}/schema.sql`])
 psql(`insert into buyers(id,auth_user_id,name,email,is_admin) values('${uuid(1)}','${uuid(11)}','Admin','a@example.test',true),('${uuid(2)}','${uuid(12)}','Buyer','b@example.test',false);
 insert into credits(id,buyer_id,total_purchased) values('${uuid(52)}','${uuid(2)}',1);
 insert into pipelines(id,buyer_id,name,is_default) values('${uuid(22)}','${uuid(2)}','Target',true);
 insert into pipeline_stages(id,pipeline_id,name) values('${uuid(32)}','${uuid(22)}','New'),('${uuid(34)}','${uuid(22)}','Fechado/Ganho');
 insert into leads(id,name,phone,assigned_to,assigned_at) values('${uuid(41)}','Fixture','+15555550100','${uuid(1)}',now()),('${uuid(42)}','Fixture2','+15555550101','${uuid(1)}',now());`)
 let n=0
 const scenario=async(name:string,fn:(db:string)=>Promise<void>)=>{const db=`case_${++n}`;psql(`create database ${db} template postgres`);await fn(db);log('PASS',name)}
 await scenario('same source different request cannot double debit, stable retry',async db=>{
  const other=background(call(),db);await wait(db)
  assert.throws(()=>psql(call(41,2,92),db),/lock timeout/)
  await other.done
  const retry=JSON.parse(psql(call(41,2,92),db));assert.equal(retry.replayed,true)
  assert.equal(psql(`select total_used from credits where id='${uuid(52)}'`,db),'1');assert.equal(psql('select count(*) from admin_new_lead_assignments',db),'1')
 })
 await scenario('competing sources for last credit never overspend',async db=>{
  const other=background(call(),db);await wait(db)
  assert.throws(()=>psql(call(42,2,92),db),/lock timeout/);await other.done
  assert.throws(()=>psql(call(42,2,92),db),/no_credit/)
  assert.equal(psql(`select total_used from credits where id='${uuid(52)}'`,db),'1');assert.equal(psql(`select archived from leads where id='${uuid(42)}'`,db),'f')
 })
 for(const [name,sql] of [
  ['source closes by pipeline insert',`insert into pipeline_leads(lead_id,pipeline_id,stage_id) values('${uuid(41)}','${uuid(22)}','${uuid(34)}')`],
  ['new contact suppression',`insert into ai_sequence_suppressions(buyer_id,lead_id,reason) values('${uuid(1)}','${uuid(41)}','manual')`],
  ['target suspension',`update buyers set is_active=false where id='${uuid(2)}'`],
  ['new debt credit',`insert into credits(buyer_id,total_purchased,total_used,expires_at) values('${uuid(2)}',0,1,'2000-01-01')`],
  ['source optout',`update leads set sms_opted_out=true where id='${uuid(41)}'`],
  ['new default pipeline',`insert into pipelines(buyer_id,name,is_default) values('${uuid(2)}','Duplicate',true)`],
  ['automation transport reservation',`insert into automation_runs(lead_id,status) values('${uuid(41)}','skipped')`],
  ['SMS transport reservation',`insert into sms_messages(lead_id,direction,status) values('${uuid(41)}','out','sending')`],
 ] as const)await scenario(name,async db=>{
  const other=background(sql,db);await wait(db);assert.throws(()=>psql(call(),db),/lock timeout/);await other.done
  assert.throws(()=>psql(call(),db),/buyer_unavailable|no_credit|contact_blocked|pipeline_unavailable|source_busy|source_unavailable/)
  assert.equal(psql(`select total_used from credits where id='${uuid(52)}'`,db),'0');assert.equal(psql('select count(*) from admin_new_lead_assignments',db),'0')
 })
 await scenario('assignment blocks late source transports while preserving source',async db=>{
  const other=background(call(),db);await wait(db)
  assert.throws(()=>psql(`insert into automation_runs(lead_id,status) values('${uuid(41)}','skipped')`,db),/lock timeout/)
  await other.done
  assert.throws(()=>psql(`insert into sms_messages(lead_id,direction,status) values('${uuid(41)}','out','sending')`,db),/source_redelivered/)
  assert.equal(psql('select count(*) from leads',db),'3')
 })
 await scenario('notification claim is single owner across connections',async db=>{
  psql(call(),db)
  const other=background("select claim_admin_new_lead_effect('notification')",db);await wait(db)
  // Claim cleanup does not lock non-expired active jobs; SKIP LOCKED returns null.
  assert.equal(psql("select claim_admin_new_lead_effect('notification') is null",db),'t')
  await other.done
  assert.equal(psql("select attempts from admin_new_lead_effects where kind='notification'",db),'1')
 })
 const inbound=(channel:string,id:string,buyer=2,body='Original reply',time='clock_timestamp()')=>channel==='sms'
  ? `insert into sms_messages(lead_id,direction,body,status,twilio_sid,created_at) values('${id}','in','${body}','received','synthetic-${channel}',${time})`
  : `insert into whatsapp_messages(buyer_id,lead_id,direction,body,from_phone,to_phone,wa_message_id,sent_at) values('${uuid(buyer)}','${id}','in','${body}','15555550100','15555550199','synthetic-${channel}',${time})`
 for(const channel of ['sms','wa'])for(const order of ['inbound-first','assignment-first']) await scenario(`${channel} STOP ${order}: commit order, no private message transfer`,async db=>{
  const insert=inbound(channel,uuid(41),1,'STOP',"'2020-02-03T04:05:06Z'")
  if(order==='inbound-first'){
   const other=background(insert,db,0.3);await wait(db)
   assert.throws(()=>psql(call(),db),/contact_blocked/);await other.done
   assert.equal(psql('select count(*) from admin_new_lead_assignments',db),'0')
  }else{
   // Exactly the stale SELECT -> assign commit -> INSERT schedule, across connections.
   assert.equal(psql(`select id from leads where id='${uuid(41)}' and redelivered_to_lead_id is null`,db),uuid(41))
   const other=background(call(),db,0.3);await wait(db)
   psql(insert,db);await other.done
   assert.equal(psql('select sms_opted_out from leads where redelivery_source_id is not null',db),'t')
   assert.equal(psql("select count(*) from ai_sequence_suppressions where reason='optout'",db),'2')
  }
  const table=channel==='sms'?'sms_messages':'whatsapp_messages',time=channel==='sms'?'created_at':'sent_at'
  assert.equal(psql(`select count(*) from ${table} where lead_id='${uuid(41)}' and body='STOP' and ${time}='2020-02-03T04:05:06Z'`,db),'1')
 })
 for(const channel of ['sms','wa'])for(const mode of ['legacy','ai_until_reply'])for(const order of ['inbound-first','enroll-first'])await scenario(`${channel}/${mode} ${order}: no until-reply enrollment survives`,async db=>{
  psql(`insert into sequences(id,buyer_id,name,mode,trigger_stage_id,ai_config) values('${uuid(61)}','${uuid(2)}','Welcome','${mode}','${uuid(32)}','{"timezone":"UTC","start":"00:00","end":"23:59","days":[0,1,2,3,4,5,6]}')`,db)
  const receipt=JSON.parse(psql(call(),db)),effect=JSON.parse(psql("select claim_admin_new_lead_effect('enrollment')",db))
  const enroll=`select enroll_admin_new_lead_sequence('${effect.id}','${effect.token}','${uuid(61)}',clock_timestamp())`,insert=inbound(channel,receipt.lead_id)
  if(order==='inbound-first'){
   const other=background(insert,db,0.3);await wait(db);assert.equal(psql(enroll,db),'f');await other.done
  }else{
   const other=background(enroll,db,0.3);await wait(db);psql(insert,db);await other.done
  }
  assert.equal(psql("select count(*) from sequence_enrollments where status in ('active','paused')",db),'0')
  assert.equal(psql(`select reason from ai_sequence_suppressions where lead_id='${receipt.lead_id}'`,db),'replied')
  assert.equal(psql('select count(*) from sequence_batch_dispatches',db),'0')
 })
 for(const channel of ['sms','wa'])for(const mode of ['legacy','ai_until_reply'])await scenario(`${channel}/${mode} inbound holds commit: transport guard fails closed without waiting`,async db=>{
  psql(`insert into sequences(id,buyer_id,name,mode,trigger_stage_id,ai_config) values('${uuid(61)}','${uuid(2)}','Welcome','${mode}','${uuid(32)}','{"timezone":"UTC","start":"00:00","end":"23:59","days":[0,1,2,3,4,5,6]}')`,db)
  const receipt=JSON.parse(psql(call(),db)),effect=JSON.parse(psql("select claim_admin_new_lead_effect('enrollment')",db))
  psql(`select enroll_admin_new_lead_sequence('${effect.id}','${effect.token}','${uuid(61)}',clock_timestamp())`,db)
  const id=psql('select id from sequence_enrollments',db)
  const claim=JSON.parse(psql(`select row_to_json(e) from claim_${mode==='legacy'?'legacy':'ai'}_sequence('${id}') e`,db))
  const other=background(inbound(channel,receipt.lead_id),db);await wait(db)
  const start=Date.now()
  assert.equal(JSON.parse(psql(`select begin_sequence_batch('${id}','${claim.lease_token}','15555550199','Must not leave')`,db)).allowed,false)
  assert.ok(Date.now()-start<500,'guard does not wait on reverse enrollment/lead locks')
  assert.equal(psql(`select count(*) from begin_ai_send('${id}','${claim.lease_token}','Must not leave')`,db),'0')
  assert.equal(psql('select count(*) from sequence_batch_dispatches',db),'0')
  await other.done
  assert.equal(psql("select count(*) from sequence_enrollments where status='stopped' and stop_reason='replied'",db),'1')
 })
 await scenario('inbound lock timeout is retryable, preserves exact message once, no partial consent',async db=>{
  const other=background(call(),db);await wait(db)
  const insert=inbound('sms',uuid(41),1,'STOP')
  const start=Date.now();assert.throws(()=>psql(insert,db),/lock timeout/);assert.ok(Date.now()-start<1200)
  assert.equal(psql("select count(*) from sms_messages where direction='in'",db),'0')
  await other.done;psql(insert,db)
  assert.equal(psql("select count(*) from sms_messages where direction='in'",db),'1')
  assert.equal(psql('select sms_opted_out from leads where redelivery_source_id is not null',db),'t')
 })
 for(const order of ['assignment-first','inbound-first'])await scenario(`cascade assignment vs delayed original STOP ${order} shares the root fence`,async db=>{
  psql(`update buyers set is_admin=true where id='${uuid(2)}';update credits set total_purchased=3`,db)
  const first=JSON.parse(psql(call(),db))
  const second=`select admin_assign_lead_as_new('${uuid(11)}','${first.lead_id}','${uuid(2)}','${uuid(92)}')`
  const insert=inbound('wa',uuid(41),1,'STOP',"'2020-02-03T04:05:06Z'")
  const other=background(order==='assignment-first'?second:insert,db,0.3);await wait(db)
  if(order==='assignment-first')psql(insert,db)
  else assert.throws(()=>psql(second,db),/contact_blocked/)
  await other.done
  assert.equal(psql('select count(*) from admin_new_lead_assignments',db),order==='assignment-first'?'2':'1')
  assert.equal(psql('select count(*) from leads where sms_opted_out',db),order==='assignment-first'?'3':'2')
  assert.equal(psql(`select count(*) from whatsapp_messages where lead_id='${uuid(41)}' and body='STOP'`,db),'1')
 })
 await scenario('private pre-fence implementations are not service-role bypass RPCs',async db=>{
  for(const fn of ['begin_sequence_batch_before_admin_redelivery(uuid,uuid,text,text)','begin_ai_send_before_admin_redelivery(uuid,uuid,text)','ai_sequence_block_before_admin_redelivery(uuid,uuid,uuid,timestamptz)']){
   assert.equal(psql(`select has_function_privilege('service_role','${fn}','execute')`,db),'f')
  }
  for(const fn of ['begin_sequence_batch(uuid,uuid,text,text)','begin_ai_send(uuid,uuid,text)','ai_sequence_block(uuid,uuid,uuid,timestamptz)']){
   assert.equal(psql(`select has_function_privilege('service_role','${fn}','execute')`,db),'t')
  }
 })
 log('SUMMARY',{passed:n,run})
}finally{if(started)log('stop',cmd(`${bin}/pg_ctl`,['-D',`${run}/data`,'-m','immediate','-w','stop']))}
}
main().catch(error=>{console.error(error);process.exitCode=1})
