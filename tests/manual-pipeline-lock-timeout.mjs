// Local-only regression: four PostgreSQL connections, real migrations/triggers.
// Empty fixture database required; PG_FIXTURE_SOCKET must be inside scratch.
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
const socket=process.env.PG_FIXTURE_SOCKET
assert.ok(socket?.startsWith('/home/hermes/.hermes/profiles/lead4pro/cache/scratch/'))
const {default:pg}=await import(process.env.PG_MODULE)
const repo=process.cwd(),clients=[],results={}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
async function connect(){const c=new pg.Client({host:socket,port:55483,user:'fixture',database:'postgres'});await c.connect();clients.push(c);return c}
const a=await connect(),b=await connect(),c=await connect(),o=await connect()
const query=(sql,args=[])=>a.query(sql,args)
const call=()=>a.query('select manual_lead_pipeline($1,$2,$3,$4,false) result',[id(11),id(41),id(21),id(31)])
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function blocker(conn){for(let i=0;i<100;i++){const blockers=(await o.query('select pg_blocking_pids($1) blockers',[conn.processID])).rows[0].blockers;if(blockers.length)return blockers;await delay(2)}return []}
try{
 const test=await readFile(path.join(repo,'tests/manual-pipeline-sql.test.ts'),'utf8');const scaffold=test.slice(test.indexOf('await db.exec(`')+15,test.indexOf('`)',test.indexOf('await db.exec(`')));await query(scaffold);
 await query(await readFile(path.join(repo,'supabase/migrations/004_kanban_crm.sql'),'utf8'));const base=await readFile(path.join(repo,'supabase/migrations/006_inbox_sequences_ai_push.sql'),'utf8');await query(base.slice(0,base.indexOf('-- AI LEAD SCORING')));
 for(const name of ['038_pipeline_moves','039_lead_unico','052_ai_sequences_until_reply','053_ai_suppression_resolution','054_sequence_batch_pacing','055_sequence_batch_completion_clock','056_sequence_reply_stage','057_manual_pipeline_entry'])await query(await readFile(path.join(repo,`supabase/migrations/${name}.sql`),'utf8'));
 await query('insert into buyers(id,auth_user_id) values($1,$2),($3,$4)',[id(1),id(11),id(2),id(12)]);await query("insert into pipelines(id,buyer_id,name) values($1,$2,'Owner 1'),($3,$4,'Owner 2')",[id(21),id(1),id(22),id(2)]);await query("insert into pipeline_stages(id,pipeline_id,name) values($1,$2,'Initial'),($3,$2,'Other'),($4,$5,'Foreign')",[id(31),id(21),id(33),id(32),id(22)]);await query('insert into leads(id,assigned_to) values($1,$2),($3,$2),($4,$5)',[id(41),id(1),id(42),id(43),id(2)]);

 // No provider/session timeout: the RPC must supply its own lock bound.
 await a.query("set statement_timeout=0;set lock_timeout=0")
 await query("insert into sequences(id,buyer_id,name,mode,trigger_stage_id,enabled) values($1,$2,'Synthetic AI','ai_until_reply',$3,true)",[id(61),id(1),id(33)])
 await query("insert into sequence_enrollments(id,buyer_id,lead_id,sequence_id,mode,status) values($1,$2,$3,$4,'ai_until_reply','active')",[id(71),id(1),id(41),id(61)])
 await c.query('begin');await c.query('lock table pipeline_moves in share mode')
 const start=performance.now()
 const pending=call().then(r=>({ok:true,result:r.rows[0]}),e=>({ok:false,code:e.code}))
 assert.ok((await blocker(a)).includes(c.processID))
 const otherWrite=b.query('insert into pipeline_leads(lead_id,pipeline_id,stage_id) values($1,$2,$3)',[id(43),id(22),id(32)])
 assert.ok((await blocker(b)).includes(a.processID))
 results.locks=(await o.query("select relation::regclass::text relation,mode,granted from pg_locks where pid=$1 and relation in ('pipeline_leads'::regclass,'pipeline_moves'::regclass)",[a.processID])).rows
 // A watchdog releases ONLY the fixture holder for cleanup on RED. Never cancel A.
 let watchdog
 const auto=await Promise.race([pending,new Promise(r=>{watchdog=setTimeout(()=>r({watchdog:true}),1500)})]);clearTimeout(watchdog)
 results.automatic=auto;results.elapsedMs=performance.now()-start
 if(auto.watchdog){await c.query('rollback');await pending;await otherWrite;assert.fail('RPC did not return automatically within 1500ms while audit lock remained held')}
 assert.deepEqual(auto,{ok:false,code:'55P03'})
 await otherWrite // must progress BEFORE releasing the audit holder
 assert.equal((await query('show lock_timeout')).rows[0].lock_timeout,'0')
 assert.equal((await query('show statement_timeout')).rows[0].statement_timeout,'0')
 assert.equal((await query('select count(*)::int n from pipeline_leads where lead_id=$1',[id(41)])).rows[0].n,0)
 assert.equal((await query('select count(*)::int n from pipeline_moves where lead_id=$1',[id(41)])).rows[0].n,0)
 assert.equal((await query('select status from sequence_enrollments where id=$1',[id(71)])).rows[0].status,'active')
 assert.equal((await query('select count(*)::int n from pipeline_leads where lead_id=$1',[id(43)])).rows[0].n,1)
 results.rollbackAndOtherTenantProgress=true
 await c.query('rollback')
 // Existing enrollment preflight is still NOWAIT, not delayed until the timeout.
 await c.query('begin');await c.query('select * from sequence_enrollments for update')
 const preflight=performance.now()
 await assert.rejects(call(),e=>e.code==='55P03' && /could not obtain lock/.test(e.message))
 results.enrollmentNowaitMs=performance.now()-preflight
 await c.query('rollback')
 // Real 052 trigger executes, and settings are restored even inside caller transaction.
 await a.query("begin;set local lock_timeout='7s'")
 results.success=(await call()).rows[0].result
 assert.equal((await query('show lock_timeout')).rows[0].lock_timeout,'7s')
 await a.query('commit')
 assert.equal((await query('show lock_timeout')).rows[0].lock_timeout,'0')
 assert.equal((await query('select stop_reason from sequence_enrollments where id=$1',[id(71)])).rows[0].stop_reason,'stage_exit')
 assert.equal((await call()).rows[0].result.changed,false)
 assert.equal((await query('select count(*)::int n from pipeline_moves where lead_id=$1',[id(41)])).rows[0].n,1)
 for(const table of ['whatsapp_messages','sms_messages','follow_ups','sequence_batch_dispatches','sequence_sender_batches'])assert.equal((await query(`select count(*)::int n from ${table}`)).rows[0].n,0)
 results.triggersSilentAndAtomic=true
 console.log('PASS bounded implicit audit lock; rollback; other tenant progresses; session settings restored; real 052 and enrollment NOWAIT preserved')
}finally{
 console.log(JSON.stringify(results,null,2))
 if(process.env.RESULT_FILE)await writeFile(process.env.RESULT_FILE,JSON.stringify(results,null,2))
 for(const conn of clients){await conn.query('rollback').catch(()=>{});await conn.end()}
}
