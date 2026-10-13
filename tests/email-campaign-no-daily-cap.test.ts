import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { campaignConfiguration, dispatchCampaigns, type CampaignDb, type CampaignProvider } from '../src/lib/email-campaigns'
const env={RESEND_API_KEY:'synthetic',RESEND_FROM_EMAIL:'Lead4Pro <test@example.invalid>',MANUAL_EMAIL_POSTAL_ADDRESS:'Synthetic postal address',EMAIL_CAMPAIGN_WEBHOOK_SECRET:'synthetic',EMAIL_CAMPAIGNS_ENABLED:'true'}
const actor='00000000-0000-0000-0000-000000000001'
const tracking=JSON.stringify({open:true,click:true,status:'verified',checked_at:new Date().toISOString()})
async function fixture(t:TestContext,n=20){
 const db=new PGlite();t.after(()=>db.close())
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table buyers(id uuid primary key,is_admin boolean,name text);
 create table leads(id uuid primary key default gen_random_uuid(),name text,email text,state text,type text default 'hot',assigned_to uuid,lead_language text,form_name text,created_at timestamptz default now());
 insert into buyers values ('${actor}',true,'Synthetic admin');
 insert into leads(name,email,state,lead_language) select 'Synthetic', 'synthetic-'||i||'@example.invalid','FL','pt' from generate_series(1,${n}) i;`)
 for(const file of ['062_admin_email_campaigns.sql','063_email_campaign_tracking_resend.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
 // Before implementation, exercise the published function for an evidence-backed RED.
 const migration=new URL('../supabase/migrations/066_campaign_no_daily_cap.sql',import.meta.url)
 if(existsSync(migration))await db.exec(readFileSync(migration,'utf8'))
 const rpc=async(name:string,args:unknown[]=[]) => (await db.query<{r:Record<string,unknown>|null}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r
 await rpc('ec_record_permission',[actor,'{}','{}','Synthetic documented insurance consent',true])
 const campaign=await rpc('ec_save',[actor,null,JSON.stringify({name:'Synthetic',subject_pt:'Seguro',subject_es:'Seguro',body_pt:'Seguro.',body_es:'Seguro.',filters:{}})])
 assert.ok(campaign)
 await rpc('ec_schedule',[actor,campaign.id,new Date().toISOString(),'{}',n,tracking])
 await db.exec("update email_campaign_rate set day=(clock_timestamp() at time zone 'UTC')::date, day_used=20000, minute=date_trunc('minute',clock_timestamp()), minute_used=0")
 return {db,rpc,campaign}
}
test('default and explicit zero mean no daily cap, while invalid configuration fails closed',()=>{
 assert.equal(campaignConfiguration(env).dailyLimit,0)
 assert.equal(campaignConfiguration({...env,EMAIL_CAMPAIGN_DAILY_LIMIT:'0'}).ready,true)
 assert.equal(campaignConfiguration({...env,EMAIL_CAMPAIGN_DAILY_LIMIT:'200'}).dailyLimit,200)
 for(const value of ['-1','Infinity','null','NaN','1.5','10001'])assert.equal(campaignConfiguration({...env,EMAIL_CAMPAIGN_DAILY_LIMIT:value}).ready,false)
})
test('worker passes explicit unlimited sentinel to the database without bypassing other checks',async()=>{
 let daily:unknown
 const db:CampaignDb={rpc:async(n,a)=>{if(n==='ec_claim')daily=a.p_daily;return {data:null,error:null}}}
 const provider:CampaignProvider={verifyDomain:async()=>true,trackingStatus:async()=>({open:true,click:true,status:'verified',checked_at:''}),send:async()=>{throw new Error('No provider calls expected')}}
 const result=await dispatchCampaigns(db,provider,campaignConfiguration({...env,EMAIL_CAMPAIGN_DAILY_LIMIT:'0'}))
 assert.equal(result.blocked,false);assert.equal(daily,0)
})
test('unlimited mode reserves after 200 and 10000 without resetting counters; global pacing is preserved',async t=>{
 const {db,rpc}=await fixture(t)
 const claims=[]
 for(let i=0;i<10;i++){const row=await rpc('ec_claim',[0,tracking]);assert.ok(row);claims.push(row.id)}
 assert.equal(new Set(claims).size,10)
 assert.equal(await rpc('ec_claim',[0,tracking]),null)
 const rate=(await db.query<{day_used:number;minute_used:number}>('select day_used,minute_used from email_campaign_rate')).rows[0]
 assert.equal(rate.day_used,20010);assert.equal(rate.minute_used,10)
})
test('explicit finite caps remain backward compatible, and invalid SQL values fail closed',async t=>{
 const {rpc}=await fixture(t)
 assert.equal(await rpc('ec_claim',[200,tracking]),null)
 for(const value of [-1,null,10001])await assert.rejects(rpc('ec_claim',[value,tracking]),/invalid_daily_limit/)
})
test('unlimited mode still blocks manual pauses, suppression, and missing promised tracking',async t=>{
 const {db,rpc,campaign}=await fixture(t)
 await rpc('ec_control',[actor,campaign.id,'pause'])
 assert.equal(await rpc('ec_claim',[0,tracking]),null)
 await rpc('ec_control',[actor,campaign.id,'resume'])
 await db.exec("update email_campaign_contacts set suppressed_at=now(),suppression_reason='unsubscribe'")
 assert.equal(await rpc('ec_claim',[0,tracking]),null)
 assert.equal((await db.query<{n:number}>("select count(*)::int n from email_campaign_recipients where state='suppressed'")).rows[0].n,20)
 const other=await fixture(t,1)
 assert.equal(await other.rpc('ec_claim',[0,null]),null)
 assert.equal((await other.db.query<{state:string}>('select state from email_campaigns')).rows[0].state,'paused')
})
test('unlimited continuation completes only the remaining queue and never retries accepted or uncertain recipients',async t=>{
 const {db,rpc,campaign}=await fixture(t,3)
 const original=await rpc('ec_claim',[0,tracking]);assert.ok(original)
 assert.equal(await rpc('ec_authorize',[original.id,original.lease]),true)
 await rpc('ec_finish',[original.id,original.lease,'accepted','synthetic-original',null])
 await db.exec("update email_campaign_recipients set state='unknown',reason='worker_interrupted' where id=(select id from email_campaign_recipients where state='pending' order by id limit 1)")
 const remaining=await rpc('ec_claim',[0,tracking]);assert.ok(remaining);assert.notEqual(remaining.id,original.id)
 assert.equal(await rpc('ec_authorize',[remaining.id,remaining.lease]),true)
 await rpc('ec_finish',[remaining.id,remaining.lease,'accepted','synthetic-remaining',null])
 assert.equal(await rpc('ec_claim',[0,tracking]),null)
 const status=(await db.query<{state:string}>('select state from email_campaigns where id=$1',[campaign.id])).rows[0]
 assert.equal(status.state,'completed')
 assert.equal((await db.query<{n:number}>("select count(*)::int n from email_campaign_recipients where state='accepted'")).rows[0].n,2)
 assert.equal((await db.query<{n:number}>("select count(*)::int n from email_campaign_recipients where state='unknown'")).rows[0].n,1)
 assert.equal((await db.query<{n:number}>("select count(*)::int n from email_campaign_recipients where provider_id='synthetic-original'")).rows[0].n,1)
})
