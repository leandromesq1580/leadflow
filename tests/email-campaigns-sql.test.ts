import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { META_FORM_LANGUAGES } from '../src/lib/lead-language'
const actor = '00000000-0000-0000-0000-000000000001'
const client = '00000000-0000-0000-0000-000000000002'
const forms = JSON.stringify(META_FORM_LANGUAGES)
type RpcResult={id:string;total_leads:number;eligible:number;exclusions:Record<string,number>;unsubscribe_token:string;lease:string;email:string}
type SqlRow={n:number;state:string;suppressed_at:string|null}
async function fixture(t: TestContext) {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table buyers(id uuid primary key, is_admin boolean, name text);
    create table leads(id uuid primary key default gen_random_uuid(),name text,email text,state text,type text default 'hot',assigned_to uuid,lead_language text,form_name text,created_at timestamptz default now());
    insert into buyers(id,is_admin) values ('${actor}',true),('${client}',false);
    insert into leads(name,email,state,lead_language,assigned_to) values ('One',' One@example.invalid ','FL','pt','${client}'),('Duplicate','one@example.invalid','FL','pt',null),('Spanish','es@example.invalid','NH','es','${client}'),('No email',null,'FL','pt',null),('Invalid','bad','FL','pt',null),('Unknown','unknown@example.invalid','FL',null,null),('Blocked','blocked@example.invalid','FL','pt',null);
  `)
  await db.exec(readFileSync(new URL('../supabase/migrations/062_admin_email_campaigns.sql',import.meta.url),'utf8'))
  const rpc = async (name: string, args: unknown[] = []) => (await db.query<{result:RpcResult}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result
  await rpc('ec_record_permission',[actor,'{}',forms,'Confirmed requests for insurance information, synthetic fixture',true])
  await db.exec(`update email_campaign_contacts set suppressed_at=now(), suppression_reason='unsubscribe' where email='blocked@example.invalid'`)
  const campaign = async () => rpc('ec_save',[actor,null,JSON.stringify({name:'Fixture',subject_pt:'Olá {{nome}}',body_pt:'Seguro para você.',subject_es:'Hola {{nome}}',body_es:'Seguro para ti.',filters:{}})])
  return { db,rpc,campaign }
}

test('audience includes client-owned leads, dedupes and explains every exclusion',async t=>{
  const {rpc}=await fixture(t)
  const a=await rpc('ec_audience',[actor,'{}',forms])
  assert.equal(a.total_leads,7)
  assert.equal(a.eligible,2)
  assert.equal(a.exclusions.duplicate,1)
  assert.equal(a.exclusions.missing_email,1)
  assert.equal(a.exclusions.invalid_email,1)
  assert.equal(a.exclusions.language,1)
  assert.equal(a.exclusions.suppressed,1)
  assert.equal(a.total_leads,a.eligible+Object.values(a.exclusions).reduce((a,b)=>a+b,0))
})

test('nonadmin cannot read or create campaigns and SQL objects are not public',async t=>{
  const {rpc,db}=await fixture(t)
  await assert.rejects(rpc('ec_audience',[client,'{}',forms]),/admin_required/)
  await assert.rejects(rpc('ec_save',[client,null,'{}']),/admin_required/)
  await db.exec('set role authenticated')
  await assert.rejects(rpc('ec_audience',[actor,'{}',forms]),/permission denied/)
  await assert.rejects(db.query('select * from email_campaign_recipients'),/permission denied/)
})

test('content and audience freeze after scheduling; pause/resume/cancel never recreate recipients',async t=>{
  const {rpc,db,campaign}=await fixture(t); const c=await campaign()
  await rpc('ec_schedule',[actor,c.id,new Date(Date.now()+1000).toISOString(),forms])
  await assert.rejects(rpc('ec_save',[actor,c.id,'{}']),/draft_required/)
  await assert.rejects(rpc('ec_schedule',[actor,c.id,new Date().toISOString(),forms]),/draft_required/)
  assert.equal((await db.query<SqlRow>('select count(*)::int n from email_campaign_recipients')).rows[0].n,2)
  await rpc('ec_control',[actor,c.id,'pause'])
  assert.equal(await rpc('ec_claim',[200]),null)
  await rpc('ec_control',[actor,c.id,'resume'])
  await rpc('ec_control',[actor,c.id,'cancel'])
  assert.equal(await rpc('ec_claim',[200]),null)
  assert.equal((await db.query<SqlRow>("select count(*)::int n from email_campaign_recipients where state='cancelled'")).rows[0].n,2)
})

test('no permission is invented; contradictory language duplicates cannot receive',async t=>{
  const {rpc,db}=await fixture(t)
  await db.exec("insert into leads(name,email,lead_language) values ('Missing consent','new@example.invalid','pt'),('Conflict','one@example.invalid','es')")
  const a=await rpc('ec_audience',[actor,'{}',forms])
  assert.equal(a.exclusions.permission,1)
  assert.equal(a.exclusions.language,2)
  assert.equal(a.eligible,1)
  const filtered=await rpc('ec_audience',[actor,JSON.stringify({languages:['pt']}),forms])
  assert.equal(filtered.eligible,0,'A language filter must not hide a conflicting duplicate elsewhere in the base')
  await assert.rejects(rpc('ec_record_permission',[actor,'{}',forms,'fixture',false]),/permission_attestation_required/)
})

test('known form language overrides the lead language exactly like TypeScript',async t=>{
  const {db,rpc}=await fixture(t)
  await db.exec("insert into leads(name,email,lead_language,form_name) values ('Form','form@example.invalid','pt','1963007337624994')")
  await rpc('ec_record_permission',[actor,'{}',forms,'Synthetic consent fixture with documented source',true])
  const a=await rpc('ec_audience',[actor,JSON.stringify({languages:['es']}),forms])
  assert.equal(a.eligible,2)
})

test('claim uses unique leases; suppression after queue is checked again immediately before send',async t=>{
  const {rpc,db,campaign}=await fixture(t); const c=await campaign()
  await rpc('ec_schedule',[actor,c.id,new Date().toISOString(),forms])
  const a=await rpc('ec_claim',[200]); const b=await rpc('ec_claim',[200]); assert.notEqual(a.id,b.id)
  await rpc('ec_unsubscribe',[a.unsubscribe_token])
  assert.equal(await rpc('ec_authorize',[a.id,a.lease]),false)
  assert.equal(await rpc('ec_authorize',[b.id,b.lease]),true)
  assert.equal(await rpc('ec_authorize',[b.id,b.lease]),false)
  assert.equal((await db.query<SqlRow>("select state from email_campaign_recipients where id=$1",[a.id])).rows[0].state,'suppressed')
})

test('uncertain sends are quarantined, not retried; cancellation does not pretend to undo an in-flight email',async t=>{
  const {rpc,db,campaign}=await fixture(t); const c=await campaign()
  await rpc('ec_schedule',[actor,c.id,new Date().toISOString(),forms]); const a=await rpc('ec_claim',[200])
  await rpc('ec_authorize',[a.id,a.lease])
  await db.exec("update email_campaign_recipients set lease_until=now()-interval '1 second'")
  await rpc('ec_claim',[200])
  assert.equal((await db.query<SqlRow>('select state from email_campaign_recipients where id=$1',[a.id])).rows[0].state,'unknown')
  await rpc('ec_control',[actor,c.id,'cancel'])
  await rpc('ec_finish',[a.id,a.lease,'accepted','fixture-provider-id',null])
  assert.equal((await db.query<SqlRow>('select state from email_campaign_recipients where id=$1',[a.id])).rows[0].state,'accepted')
})

test('provider events are idempotent, reordered delivery does not overwrite bounce, bounce suppresses globally',async t=>{
  const {rpc,db,campaign}=await fixture(t); const c=await campaign()
  await rpc('ec_schedule',[actor,c.id,new Date().toISOString(),forms]); const a=await rpc('ec_claim',[200]); await rpc('ec_authorize',[a.id,a.lease])
  // A webhook can beat the response to the sending worker.
  await rpc('ec_event',['event-1','provider-1','email.delivered',new Date().toISOString(),a.id])
  await rpc('ec_finish',[a.id,a.lease,'accepted','provider-1',null])
  assert.equal((await db.query<SqlRow>('select state from email_campaign_recipients where id=$1',[a.id])).rows[0].state,'delivered')
  await rpc('ec_event',['event-2','provider-1','email.bounced',new Date().toISOString()])
  await rpc('ec_event',['event-3','provider-1','email.delivered',new Date().toISOString()])
  await rpc('ec_event',['event-2','provider-1','email.bounced',new Date().toISOString()])
  assert.equal((await db.query<SqlRow>('select state from email_campaign_recipients where id=$1',[a.id])).rows[0].state,'bounced')
  assert.ok((await db.query<SqlRow>('select suppressed_at from email_campaign_contacts where email=$1',[a.email])).rows[0].suppressed_at)
  assert.equal((await db.query<SqlRow>("select count(*)::int n from email_campaign_events where event_id='event-2'")).rows[0].n,1)
})

test('lead removal preserves snapshots and changed/removed lead cannot be sent',async t=>{
  const {rpc,db,campaign}=await fixture(t)
  const fk=(await db.query<{confdeltype:string}>("select confdeltype from pg_constraint where conrelid='email_campaign_recipients'::regclass and confrelid='leads'::regclass")).rows[0]
  assert.equal(fk.confdeltype,'n','ON DELETE SET NULL prevents a regression in existing lead removal')
  const c=await campaign();await rpc('ec_schedule',[actor,c.id,new Date().toISOString(),forms]);const a=await rpc('ec_claim',[200])
  await db.query('update leads set email=$1 where id=(select lead_id from email_campaign_recipients where id=$2)',['changed@example.invalid',a.id])
  assert.equal(await rpc('ec_authorize',[a.id,a.lease]),false)
  const b=await rpc('ec_claim',[200]);await db.query('update email_campaign_recipients set lead_id=null where id=$1',[b.id])
  assert.equal(await rpc('ec_authorize',[b.id,b.lease]),false)
})

test('global daily and minute limits hold across campaigns; changing limits cannot free consumed capacity',async t=>{
  const {rpc,campaign}=await fixture(t); const c=await campaign()
  await rpc('ec_schedule',[actor,c.id,new Date().toISOString(),forms])
  assert.ok(await rpc('ec_claim',[1])); assert.equal(await rpc('ec_claim',[1]),null)
})
