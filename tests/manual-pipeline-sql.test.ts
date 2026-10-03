import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
async function fixture(){
 const db=new PGlite(); const q=async(sql:string,args:unknown[]=[]) => (await db.query(sql,args)).rows as Record<string,unknown>[]
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select null::uuid'; CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'select gen_random_uuid()';
 CREATE TABLE buyers(id uuid primary key,auth_user_id uuid,is_admin boolean default false,is_active boolean default true);
 CREATE TABLE team_members(id uuid primary key,buyer_id uuid,auth_user_id uuid,is_active boolean default true);
 CREATE TABLE leads(id uuid primary key,assigned_to uuid,assigned_to_member uuid,archived boolean default false,contract_closed boolean default false,sms_opted_out boolean default false,phone text);
 CREATE TABLE templates(id uuid primary key,buyer_id uuid,is_system boolean,type text default 'whatsapp');
 CREATE TABLE sms_messages(id uuid primary key default gen_random_uuid(),lead_id uuid,direction text,body text,from_phone text,to_phone text,twilio_sid text unique,created_at timestamptz default now());`)
 const crm=readFileSync('supabase/migrations/004_kanban_crm.sql','utf8');await db.exec(crm)
 const base=readFileSync('supabase/migrations/006_inbox_sequences_ai_push.sql','utf8');await db.exec(base.slice(0,base.indexOf('-- AI LEAD SCORING')))
 for(const f of ['038_pipeline_moves','039_lead_unico','052_ai_sequences_until_reply','053_ai_suppression_resolution','054_sequence_batch_pacing','055_sequence_batch_completion_clock','056_sequence_reply_stage'])await db.exec(readFileSync(`supabase/migrations/${f}.sql`,'utf8'))
 const file='supabase/migrations/057_manual_pipeline_entry.sql';if(existsSync(file))await db.exec(readFileSync(file,'utf8'))
 await q('insert into buyers(id,auth_user_id,is_admin) values($1,$2,false),($3,$4,false),($5,$6,true)',[uuid(1),uuid(11),uuid(2),uuid(12),uuid(3),uuid(13)])
 await q("insert into pipelines(id,buyer_id,name) values($1,$2,'Own'),($3,$4,'Foreign'),($5,$2,'Other own')",[uuid(21),uuid(1),uuid(22),uuid(2),uuid(23)])
 await q("insert into pipeline_stages(id,pipeline_id,name) values($1,$2,'New'),($3,$4,'Other'),($5,$2,'Contact'),($6,$7,'New')",[uuid(31),uuid(21),uuid(32),uuid(22),uuid(33),uuid(34),uuid(23)])
 await q('insert into leads(id,assigned_to) values($1,$2)',[uuid(41),uuid(1)])
 const call=async(auth=11,pipe:number|null=21,stage:number|null=31,admin=false)=>(await q('select manual_lead_pipeline($1,$2,$3,$4,$5) result',[uuid(auth),uuid(41),pipe?uuid(pipe):null,stage?uuid(stage):null,admin]))[0].result as {changed:boolean;entry:{id:string;stage_id:string};pipelines:unknown[];eligible:boolean}
 return {db,q,call}
}
test('retry never overwrites stage, any existing other card conflicts, audit failure rolls back',async()=>{
 const {db,q,call}=await fixture();try{
  const first=await call();assert.equal((await call()).changed,false)
  assert.equal((await q('select count(*)::int n from pipeline_moves'))[0].n,1)
  await q('update pipeline_leads set stage_id=$1 where id=$2',[uuid(33),first.entry.id])
  await assert.rejects(call(),/card_already_exists/)
  assert.equal((await q('select stage_id from pipeline_leads'))[0].stage_id,uuid(33))
  for(const [pipe,stage] of [[21,33],[22,32],[23,34]]){
   await q('delete from pipeline_leads');await q('insert into pipeline_leads(lead_id,pipeline_id,stage_id) values($1,$2,$3)',[uuid(41),uuid(pipe),uuid(stage)])
   const before=await q('select * from pipeline_leads');await assert.rejects(call(),/card_already_exists/);assert.deepEqual(await q('select * from pipeline_leads'),before)
  }
  await q('delete from pipeline_leads');await db.exec("CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit failure'; END $$; CREATE TRIGGER fail_audit BEFORE INSERT ON pipeline_moves FOR EACH ROW EXECUTE FUNCTION fail_audit();")
  await assert.rejects(call(),/fixture audit failure/);assert.equal((await q('select count(*)::int n from pipeline_leads'))[0].n,0)
 }finally{await db.close()}
})
test('options exclude foreign pipelines; agency members only repair leads assigned to them',async()=>{
 const {db,q,call}=await fixture();try{
  const options=await call(11,null,null);assert.equal(options.eligible,true);assert.equal(options.pipelines.length,2)
  await q('insert into team_members(id,buyer_id,auth_user_id) values($1,$2,$3)',[uuid(51),uuid(1),uuid(15)])
  await assert.rejects(call(15),/forbidden/)
  await q('update leads set assigned_to_member=$1',[uuid(51)]);await call(15)
  assert.equal((await q('select actor_member_id from pipeline_moves'))[0].actor_member_id,uuid(51))
  assert.equal((await call(11,null,null)).eligible,false)
  await q('update team_members set is_active=false');await assert.rejects(call(15),/forbidden/)
 }finally{await db.close()}
})
test('authority, owner and stage must agree even for admin; rejected writes leave no cards',async()=>{
 const {db,q,call}=await fixture();try{
  for(const args of [[99,21,31,false],[12,21,31,false],[11,21,31,true],[13,22,32,true],[11,21,32,false]] as const){
   await assert.rejects(call(args[0],args[1],args[2],args[3]),e=> (e as {code:string}).code==='42501')
   assert.equal((await q('select count(*)::int n from pipeline_leads'))[0].n,0)
  }
  await q('update buyers set is_active=false where id=$1',[uuid(1)]);await assert.rejects(call(),/forbidden/);await q('update buyers set is_active=true')
  await q('update leads set archived=true');await assert.rejects(call(),/lead_unavailable/)
  await q('update leads set archived=false');assert.equal((await call(13,21,31,true)).changed,true)
  for(const role of ['anon','authenticated','service_role'])assert.equal((await q("select has_function_privilege($1,'manual_lead_pipeline(uuid,uuid,uuid,uuid,boolean)','execute') ok",[role]))[0].ok,role==='service_role')
 }finally{await db.close()}
})
test('repair existing lead creates exactly one silent audited card without changing assignment or enrolling',async()=>{
 const {db,q,call}=await fixture();try{
  assert.equal((await q("select count(*)::int n from pg_proc where proname='manual_lead_pipeline'"))[0].n,1,'manual repair RPC must exist')
  // Enabled stage sequences make a no-enrollment assertion meaningful.
  await q("insert into sequences(id,buyer_id,name,trigger_stage_id,enabled) values($1,$2,'Legacy fixture',$3,true),($4,$2,'AI fixture',$3,true)",[uuid(61),uuid(1),uuid(31),uuid(62)])
  await q("update sequences set mode='ai_until_reply' where id=$1",[uuid(62)])
  const before=await q('select * from leads');const buyers=await q('select * from buyers');const result=await call()
  assert.equal(result.changed,true);assert.equal(result.entry.stage_id,uuid(31))
  const cards=await q('select * from pipeline_leads');assert.equal(cards.length,1);assert.ok(cards[0].sequence_reply_moved_at)
  assert.deepEqual(await q('select * from leads'),before);assert.deepEqual(await q('select * from buyers'),buyers)
  for(const table of ['whatsapp_messages','sms_messages','sequence_batch_dispatches','sequence_sender_batches','follow_ups'])assert.equal((await q(`select count(*)::int n from ${table}`))[0].n,0)
  // Execute the real stage target finder against the actual inserted PostgreSQL row.
  const proxyDb={from(table:string){
   const filters:{key:string;value:unknown}[]=[];const query:Record<string,unknown>={}
   for(const method of ['select','eq','in','gte','lte','is'])query[method]=(...args:unknown[])=>{if(method==='is')filters.push({key:String(args[0]),value:args[1]});return query}
   query.then=async(resolve:(value:unknown)=>void)=>{
    if(table==='pipelines')return resolve({data:await q('select id from pipelines where buyer_id=$1',[uuid(1)])})
    assert.equal(table,'pipeline_leads')
    const rows=await q('select * from pipeline_leads');resolve({data:rows.filter(row=>filters.every(f=>row[f.key]===f.value))})
   };return query
  }}
  const source=readFileSync('src/lib/automation-engine.ts','utf8')+'\nexport {findTargets}'
  const mod={exports:{} as {findTargets:(c:unknown)=>Promise<unknown[]>}}
  new Function('require','module','exports',transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)((name:string)=>name==='@/lib/supabase/admin'?{createAdminClient:()=>proxyDb}:{},mod,mod.exports)
  for(const trigger_type of ['stage_entered','stage_stale'])assert.deepEqual(await mod.exports.findTargets({buyer_id:uuid(1),trigger_type,created_at:'2000-01-01',trigger_config:{stage_id:uuid(31),days_stale:0}}),[])
  await q('update pipeline_leads set stage_id=$1',[uuid(33)]);assert.equal((await q('select sequence_reply_moved_at from pipeline_leads'))[0].sequence_reply_moved_at,null,'later ordinary movement restores automation semantics')
  assert.equal((await q('select count(*)::int n from sequence_enrollments'))[0].n,0)
  const audit=await q('select * from pipeline_moves');assert.equal(audit.length,1);assert.equal(audit[0].actor_auth_user_id,uuid(11));assert.equal(audit[0].via,'manual-silent-entry')
 }finally{await db.close()}
})
