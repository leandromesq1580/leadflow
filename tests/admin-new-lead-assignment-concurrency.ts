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
const background=(sql:string,db:string)=>{
 const proc=spawn('/usr/bin/psql',['-X','-h',socket,'-p','55493','-U','fixture','-d',db,'-v','ON_ERROR_STOP=1','-At','-c',`set application_name='redelivery_blocker';begin;${sql};select pg_sleep(2);commit;`],{env})
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
 log('SUMMARY',{passed:n,run})
}finally{if(started)log('stop',cmd(`${bin}/pg_ctl`,['-D',`${run}/data`,'-m','immediate','-w','stop']))}
}
main().catch(error=>{console.error(error);process.exitCode=1})
