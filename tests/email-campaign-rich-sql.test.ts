import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {encodeCampaignHtml} from '../src/lib/email-campaign-rich'
import {validateCampaign,renderCampaignEmail,campaignConfiguration,type CampaignDraft} from '../src/lib/email-campaigns'
const migration=readFileSync(new URL('../supabase/migrations/064_campaign_rich_images.sql',import.meta.url),'utf8')
test('migration cria bucket dedicado público sem mudar anexos privados; mesmo com política ampla bloqueia escrita direta',async t=>{
 const db=new PGlite();t.after(()=>db.close())
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated,service_role;grant all on storage.objects to anon,authenticated,service_role;
 create policy fixture_broad_policy on storage.objects for all to anon,authenticated using(true) with check(true);
 insert into storage.buckets values('lead-attachments','lead-attachments',false,52428800,array['audio/mpeg']);`)
 const old=(await db.query('select * from storage.buckets')).rows[0];await db.exec(migration)
 assert.deepEqual((await db.query("select * from storage.buckets where id='lead-attachments'")).rows[0],old)
 assert.equal((await db.query<{public:boolean}>("select public from storage.buckets where id='campaign-images'")).rows[0].public,true)
 await db.exec("insert into storage.objects(bucket_id,name)values('campaign-images','original.png'),('lead-attachments','recording.mp3')")
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role)
  await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values('campaign-images','intrusion.png')"),/row-level security/)
  await db.exec("update storage.objects set name='changed.png' where bucket_id='campaign-images'")
  await db.exec("delete from storage.objects where bucket_id='campaign-images'")
  await assert.rejects(db.exec("update storage.objects set bucket_id='campaign-images' where bucket_id='lead-attachments'"),/row-level security/)
  await db.exec('reset role')
  assert.equal((await db.query<{name:string}>("select name from storage.objects where bucket_id='campaign-images'")).rows[0].name,'original.png')
 }
 await db.exec("set role service_role;insert into storage.objects(bucket_id,name) values('campaign-images','admin.png');reset role")
 assert.equal((await db.query<{n:number}>("select count(*)::int n from storage.objects where bucket_id='campaign-images'")).rows[0].n,2)
})
test('salvar e reabrir SQL mantém HTML sanitizado, destino exato e imagem; envio offline renderiza conteúdo sem mandar email',async t=>{
 const db=new PGlite();t.after(()=>db.close());const actor='00000000-0000-0000-0000-000000000001'
 await db.exec(`create role anon;create role authenticated;create role service_role;create table buyers(id uuid primary key,is_admin boolean,name text);create table leads(id uuid primary key default gen_random_uuid(),name text,email text,state text,type text default 'hot',assigned_to uuid,lead_language text,form_name text,created_at timestamptz default now());insert into buyers(id,is_admin) values('${actor}',true);`)
 for(const name of ['062_admin_email_campaigns.sql','063_email_campaign_tracking_resend.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'))
 const body=encodeCampaignHtml('<p>Olá {{nome}}, <strong>seguro de vida</strong></p><p><a href="https://wa.me/17867442126?text=Cota%C3%A7%C3%A3o">clique aqui para falar comigo</a></p><img src="https://example.org/family.png" alt="Família">')
 const validated=validateCampaign({name:'Rich SQL',subject_pt:'Olá',subject_es:'Hola',body_pt:body,body_es:body,filters:{}});assert.equal(validated.ok,true);if(!validated.ok)throw Error('invalid_fixture')
 const saved=(await db.query<{value:{id:string}}>('select public.ec_save($1,null,$2::jsonb) value',[actor,JSON.stringify(validated.value)])).rows[0].value
 const result=(await db.query<{value:{campaigns:CampaignDraft[]}}>('select public.ec_list($1,$2) value',[actor,saved.id])).rows[0].value.campaigns[0]
 assert.equal(result.body_pt,body);assert.equal(result.body_es,body)
 const config=campaignConfiguration({RESEND_API_KEY:'synthetic',EMAIL_CAMPAIGN_WEBHOOK_SECRET:'synthetic',MANUAL_EMAIL_POSTAL_ADDRESS:'Synthetic address',EMAIL_CAMPAIGNS_ENABLED:'true'})
 const email=renderCampaignEmail({campaign:result,name:'Ana',language:'pt',unsubscribe_token:'00000000-0000-4000-8000-000000000001'},config)
 assert.match(email.html,/<strong>seguro de vida<\/strong>/);assert.match(email.html,/href="https:\/\/wa.me\/17867442126\?text=Cota%C3%A7%C3%A3o"/);assert.match(email.html,/src="https:\/\/example.org\/family.png"/);assert.match(email.text,/seguro de vida/);assert.doesNotMatch(email.text,/lead4pro-rich/)
})
