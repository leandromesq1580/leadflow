// Multi-connection PostgreSQL only. Refuses TCP and requires an explicit scratch socket.
// PG_MODULE=/.../pg/lib/index.js PG_FIXTURE_SOCKET=/.../scratch/... node tests/manual-pipeline-concurrency.mjs
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const socket=process.env.PG_FIXTURE_SOCKET
assert.ok(socket?.startsWith('/home/hermes/.hermes/profiles/lead4pro/cache/scratch/'))
const {default: pg}=await import(process.env.PG_MODULE)
const {Client}=pg
const connect=async()=>{const c=new Client({host:socket,port:55481,user:'fixture',database:'postgres'});await c.connect();return c}
const a=await connect(),b=await connect();const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const call=c=>c.query('select manual_lead_pipeline($1,$2,$3,$4,false) result',[id(11),id(41),id(21),id(31)])
try{
 await a.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE TABLE buyers(id uuid primary key,auth_user_id uuid,is_admin boolean default false,is_active boolean default true);
 CREATE TABLE team_members(id uuid primary key,buyer_id uuid,auth_user_id uuid,is_active boolean default true);
 CREATE TABLE leads(id uuid primary key,assigned_to uuid,assigned_to_member uuid,archived boolean default false);
 CREATE TABLE sequence_enrollments(id uuid primary key,lead_id uuid,buyer_id uuid,sequence_id uuid,mode text,status text,stop_reason text,completed_at timestamptz);
 CREATE TABLE pipelines(id uuid primary key,buyer_id uuid,name text);
 CREATE TABLE pipeline_stages(id uuid primary key,pipeline_id uuid,name text,position int default 0);
 CREATE TABLE pipeline_leads(id uuid primary key default gen_random_uuid(),lead_id uuid references leads(id),pipeline_id uuid references pipelines(id),stage_id uuid references pipeline_stages(id),position int,moved_at timestamptz,sequence_reply_moved_at timestamptz,unique(lead_id,pipeline_id));`)
 for(const name of ['038_pipeline_moves','039_lead_unico','057_manual_pipeline_entry'])await a.query(await readFile(`supabase/migrations/${name}.sql`,'utf8'))
 await a.query('insert into buyers(id,auth_user_id) values($1,$2)',[id(1),id(11)])
 await a.query("insert into pipelines values($1,$2,'Fixture')",[id(21),id(1)])
 await a.query("insert into pipeline_stages(id,pipeline_id,name) values($1,$2,'New')",[id(31),id(21)])
 await a.query('insert into leads(id,assigned_to) values($1,$2)',[id(41),id(1)])
 // Simultaneous repairs cannot double-add: the loser fails fast, then retries idempotently.
 await a.query('begin');await call(a);await assert.rejects(call(b),e=>e.code==='55P03');await a.query('commit')
 assert.equal((await call(b)).rows[0].result.changed,false)
 assert.equal((await a.query('select count(*)::int n from pipeline_moves')).rows[0].n,1)
 console.log('PASS simultaneous repair: busy then idempotent; one card and one audit')
 await a.query('delete from pipeline_leads')
 // Even a legacy writer not taking lead/advisory locks is fenced.
 await a.query('begin');await a.query('insert into pipeline_leads(lead_id,pipeline_id,stage_id) values($1,$2,$3)',[id(41),id(21),id(31)])
 await assert.rejects(call(b),e=>e.code==='55P03');await a.query('commit');assert.equal((await call(b)).rows[0].result.changed,false)
 console.log('PASS concurrent legacy INSERT cannot be removed by repair or duplicated')
 await a.query('delete from pipeline_leads')
 for(const [table,statement] of [['leads','update leads set assigned_to=$1'],['pipelines','update pipelines set buyer_id=$1'],['pipeline_stages','update pipeline_stages set pipeline_id=$1'],['buyers','update buyers set is_admin=true where id=$1']]){
  await a.query('begin');await a.query(statement,[id(table==='buyers'?1:2)]);await assert.rejects(call(b),e=>e.code==='55P03');await a.query('rollback')
  console.log('PASS concurrent ownership/config lock:',table)
 }
 // Committed ownership change is revalidated, not authorized from stale UI/options.
 await a.query('update leads set assigned_to=$1',[id(2)]);await assert.rejects(call(b),e=>e.code==='42501')
 assert.equal((await a.query('select count(*)::int n from pipeline_leads')).rows[0].n,0)
 console.log('PASS committed owner change rejects stale selection; no card')
 // Real 052 recheck trigger locking path; only its policy callback is a no-op fixture.
 const cancellation=await readFile('supabase/migrations/052_ai_sequences_until_reply.sql','utf8')
 await a.query(cancellation.slice(cancellation.indexOf('CREATE FUNCTION public.recheck_ai_sequences()'),cancellation.indexOf('CREATE TRIGGER ai_recheck_lead')))
 await a.query(`CREATE FUNCTION ai_sequence_block(uuid,uuid,uuid) RETURNS text LANGUAGE sql AS 'select null::text';
 CREATE TRIGGER ai_recheck_stage AFTER INSERT OR UPDATE OR DELETE ON pipeline_leads FOR EACH ROW EXECUTE FUNCTION recheck_ai_sequences();`)
 await a.query('update leads set assigned_to=$1',[id(1)])
 await a.query("insert into sequence_enrollments(id,lead_id,buyer_id,sequence_id,mode,status) values($1,$2,$3,$4,'ai_until_reply','active')",[id(61),id(41),id(1),id(62)])
 await a.query('begin');await a.query('select * from sequence_enrollments for update')
 await b.query("set statement_timeout='1500ms'")
 await assert.rejects(call(b),e=>e.code==='55P03','repair must fail fast BEFORE the existing recheck trigger waits on an enrollment')
 await a.query('rollback')
 assert.equal((await a.query('select count(*)::int n from pipeline_leads')).rows[0].n,0)
 console.log('PASS existing enrollment lock cannot stall trigger or create lead/enrollment deadlock; no card')
}finally{await a.query('rollback');await b.query('rollback');await a.end();await b.end()}
