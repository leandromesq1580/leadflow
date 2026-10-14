import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {createCampaignHandlers} from '../src/lib/email-campaign-api'
const actor='00000000-0000-0000-0000-000000000001'
const user='00000000-0000-0000-0000-000000000002'
const migrations=['062_admin_email_campaigns.sql','063_email_campaign_tracking_resend.sql','066_campaign_no_daily_cap.sql','068_campaign_meta_only.sql']
async function setup(){
 const db=new PGlite()
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE FUNCTION gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(repeat('aa',n),'hex') $$;
 CREATE TABLE buyers(id uuid PRIMARY KEY,is_admin boolean,is_active boolean);
 CREATE TABLE leads(id uuid PRIMARY KEY,name text,email text,lead_language text,meta_lead_id text,form_name text,campaign_name text,raw_data jsonb DEFAULT '{}',assigned_to uuid,state text,type text,created_at timestamptz DEFAULT now());
 INSERT INTO buyers VALUES('${actor}',true,true),('${user}',false,true);`)
 for(const f of migrations){const p=new URL('../supabase/migrations/'+f,import.meta.url);if(existsSync(p))await db.exec(readFileSync(p,'utf8'))}
 const rpc=async(name:string,args:string='')=>(await db.query<{result:any}>(`SELECT public.${name}(${args}) AS result`)).rows[0].result
 const add=async(n:number,email:string,meta:string|null=null,source='Meta Lead Ads')=>{const id='10000000-0000-0000-0000-'+String(n).padStart(12,'0');await db.query(`INSERT INTO leads(id,name,email,lead_language,meta_lead_id,form_name,campaign_name,raw_data,created_at) VALUES($1,'Synthetic',$2,'pt',$3,$4,$4,$5,now()+($6||' seconds')::interval)`,[id,email,meta,source,JSON.stringify({source:source==='Import CSV'?'csv_import':source}),String(n)]);return id}
 const consent=async(email:string)=>db.query(`INSERT INTO email_campaign_contacts(email,consent_at,consent_by,consent_evidence) VALUES($1,now(),$2,'synthetic historical permission') ON CONFLICT(email) DO UPDATE SET consent_at=now(),consent_by=$2,consent_evidence='synthetic historical permission'`,[email,actor])
 const draft=async()=>rpc('ec_save',`'${actor}',NULL,'{"name":"Synthetic","subject_pt":"Seguro","body_pt":"Conteúdo","subject_es":"Seguro","body_es":"Contenido","filters":{}}'`)
 return {db,rpc,add,consent,draft}
}
test('preview and permission only include Meta; labels PT or Meta campaign name do not authorize non-Meta',async()=>{
 const f=await setup();try{
 await f.add(1,'meta@example.invalid','123');await f.add(2,'csv@example.invalid',null,'Import CSV');await f.add(3,'manual@example.invalid',null,'Manual');await f.add(4,'landing@example.invalid',null,'Consultoria');await f.add(5,'empty@example.invalid','  ');await f.add(6,'named-meta@example.invalid',null,'Meta Lead Ads')
 for(const e of ['meta','csv','manual','landing','empty','named-meta'])await f.consent(e+'@example.invalid')
 const preview=await f.rpc('ec_audience',`'${actor}','{}','{}'`);assert.equal(preview.eligible,1);assert.equal(preview.exclusions.non_meta,5)
 const permission=await f.rpc('ec_record_permission',`'${actor}','{}','{}','synthetic renewed Meta form permission',true`);assert.equal(permission,0)
 }finally{await f.db.close()}
})
test('a newer CSV duplicate cannot replace the Meta lead and a fresh grant cannot reach CSV-only email',async()=>{
 const f=await setup();try{
 const mid=await f.add(1,'shared@example.invalid','321');await f.add(2,'shared@example.invalid',null,'Import CSV');await f.add(3,'csv-only@example.invalid',null,'Import CSV')
 const grant=await f.rpc('ec_record_permission',`'${actor}','{}','{}','synthetic confirmed permission for Meta form',true`);assert.equal(grant,1)
 const rows=await f.db.query<any>(`SELECT * FROM ec_rows('{}','{}') WHERE reason IS NULL`);assert.equal(rows.rows.length,1);assert.equal(rows.rows[0].lead_id,mid)
 assert.equal((await f.db.query<any>(`SELECT count(*)::int n FROM email_campaign_contacts WHERE email='csv-only@example.invalid'`)).rows[0].n,0)
 }finally{await f.db.close()}
})
test('legacy non-Meta snapshot is refused immediately before transport; Meta revocation and changed email are rechecked',async()=>{
 const f=await setup();try{
 for(const [n,email,meta,source] of [[1,'csv@example.invalid',null,'Import CSV'],[2,'meta@example.invalid','123','Meta Lead Ads']] as const){
 const lead=await f.add(n,email,meta,source);await f.consent(email);const c=await f.draft();await f.db.query(`UPDATE email_campaigns SET state='running' WHERE id=$1`,[c.id]);const rid=(await f.db.query<any>(`INSERT INTO email_campaign_recipients(campaign_id,lead_id,email,name,language,state,lease,lease_until) VALUES($1,$2,$3,'Synthetic','pt','reserved',gen_random_uuid(),now()+interval '5 minutes') RETURNING id,lease`,[c.id,lead,email])).rows[0]
 const ok=await f.rpc('ec_authorize',`'${rid.id}','${rid.lease}'`);assert.equal(ok,n===2)
 if(n===1)assert.equal((await f.db.query<any>(`SELECT reason FROM email_campaign_recipients WHERE id=$1`,[rid.id])).rows[0].reason,'non_meta')
 if(n===2){await f.db.query(`UPDATE email_campaign_recipients SET state='reserved' WHERE id=$1`,[rid.id]);await f.db.query(`UPDATE leads SET meta_lead_id=NULL WHERE id=$1`,[lead]);assert.equal(await f.rpc('ec_authorize',`'${rid.id}','${rid.lease}'`),false)}
 }
 }finally{await f.db.close()}
})
test('revocation is audited, admin-only, idempotent, clears only non-Meta permission, preserves delivery evidence and suppressions',async()=>{
 const f=await setup();try{
 const meta=await f.add(1,'meta@example.invalid','123');const csv=await f.add(2,'csv@example.invalid',null,'Import CSV');await f.consent('meta@example.invalid');await f.consent('csv@example.invalid');await f.consent('orphan@example.invalid');await f.db.exec(`UPDATE email_campaign_contacts SET suppressed_at=now(),suppression_reason='provider_bounce' WHERE email='csv@example.invalid'`)
 const c=await f.draft();await f.consent('pending@example.invalid');await f.db.query(`UPDATE email_campaigns SET state='running' WHERE id=$1`,[c.id]);
 await f.db.query(`INSERT INTO email_campaign_recipients(campaign_id,lead_id,email,name,language,state,accepted_at,provider_id) VALUES($1,$2,'csv@example.invalid','Synthetic','pt','accepted',now(),'synthetic-provider-id'),($1,$2,'pending@example.invalid','Synthetic','pt','pending',NULL,NULL),($1,$3,'meta@example.invalid','Synthetic','pt','pending',NULL,NULL)`,[c.id,csv,meta])
 await assert.rejects(f.rpc('ec_revoke_non_meta',`'${user}'`),/admin_required/)
 const r=await f.rpc('ec_revoke_non_meta',`'${actor}'`);assert.equal(r.revoked_contacts,3);assert.equal(r.blocked_recipients,1)
 assert.equal((await f.db.query<any>(`SELECT count(*)::int n FROM email_campaign_contacts WHERE consent_at IS NOT NULL`)).rows[0].n,1)
 const csvContact=(await f.db.query<any>(`SELECT * FROM email_campaign_contacts WHERE email='csv@example.invalid'`)).rows[0];assert.equal(csvContact.consent_by,null);assert.equal(csvContact.consent_evidence,null);assert.ok(csvContact.suppressed_at);assert.equal(csvContact.suppression_reason,'provider_bounce')
 assert.equal((await f.db.query<any>(`SELECT count(*)::int n FROM email_campaign_recipients WHERE provider_id='synthetic-provider-id' AND accepted_at IS NOT NULL AND state='accepted'`)).rows[0].n,1)
 assert.equal((await f.db.query<any>(`SELECT count(*)::int n FROM email_campaign_audit WHERE action='permission_revoked_non_meta'`)).rows[0].n,1)
 const again=await f.rpc('ec_revoke_non_meta',`'${actor}'`);assert.equal(again.revoked_contacts,0);assert.equal(again.blocked_recipients,0)
 const acl=await f.db.query<any>(`SELECT has_function_privilege('anon','ec_revoke_non_meta(uuid)','EXECUTE') a,has_function_privilege('authenticated','ec_revoke_non_meta(uuid)','EXECUTE') b,has_function_privilege('service_role','ec_revoke_non_meta(uuid)','EXECUTE') c`);assert.deepEqual(acl.rows[0],{a:false,b:false,c:true})
 }finally{await f.db.close()}
})
test('resend audience excludes historically delivered imported recipients',async()=>{
 const f=await setup();try{
 const csv=await f.add(1,'csv@example.invalid',null,'Import CSV');const meta=await f.add(2,'meta@example.invalid','123');await f.consent('csv@example.invalid');await f.consent('meta@example.invalid');const c=await f.draft();await f.db.query(`UPDATE email_campaigns SET state='completed',tracking_snapshot='{"open":true,"click":true}' WHERE id=$1`,[c.id]);await f.db.query(`INSERT INTO email_campaign_recipients(campaign_id,lead_id,email,name,language,state,accepted_at,delivered_at) VALUES($1,$2,'csv@example.invalid','Synthetic','pt','delivered',now()-interval '3 days',now()-interval '3 days'),($1,$3,'meta@example.invalid','Synthetic','pt','delivered',now()-interval '3 days',now()-interval '3 days')`,[c.id,csv,meta])
 const r=await f.db.query<any>(`SELECT * FROM ec_resend_rows($1)`,[c.id]);assert.equal(r.rows.filter(x=>x.reason===null).length,1);assert.equal(r.rows.find(x=>x.email==='csv@example.invalid').reason,'non_meta')
 }finally{await f.db.close()}
})
test('revocation HTTP requires explicit confirmation and admin, rejects unknown fields and never sends',async()=>{
 const calls:string[]=[];const h=createCampaignHandlers({authenticate:async()=>({id:actor}),runtime:()=>({config:{} as any,provider:{} as any,db:{rpc:async(n)=>{calls.push(n);return {data:{revoked_contacts:2,blocked_recipients:0},error:null}}}})})
 const post=(body:any)=>h.POST(new Request('https://lead4producers.com/api/admin/email-campaigns',{method:'POST',headers:{origin:'https://lead4producers.com','content-type':'application/json'},body:JSON.stringify(body)}))
 assert.equal((await post({action:'revoke_non_meta'})).status,400);assert.equal(calls.length,0)
 assert.equal((await post({action:'revoke_non_meta',confirm:true,filters:{}})).status,400);assert.equal(calls.length,0)
 assert.equal((await post({action:'revoke_non_meta',confirm:true})).status,200);assert.deepEqual(calls,['ec_revoke_non_meta'])
})
