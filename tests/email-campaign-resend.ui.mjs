// Real UI + real local SQL + real HTTP handlers for campaign reporting and the safe resend flow.
// All contacts, provider replies and dates are synthetic (example.invalid). No mail is ever sent.
// Requires EC_TEST_SOCKET (Unix socket), EC_TEST_TOOL_DIR with playwright/pg and EC_TEST_OUTPUT.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),tools=process.env.EC_TEST_TOOL_DIR
const host=process.env.EC_TEST_SOCKET,out=process.env.EC_TEST_OUTPUT
if(!host?.startsWith('/')||!tools||!out)throw new Error('Local socket, verification tool directory and output directory required')
const require=createRequire(tools+'/package.json'),appRequire=createRequire(repo+'/package.json')
const {Client}=require('pg'),{chromium}=require('playwright'),esbuild=appRequire('esbuild')
const postcss=appRequire('postcss'),tailwind=appRequire('@tailwindcss/postcss')
const {createCampaignHandlers}=await import('../src/lib/email-campaign-api.ts')
const {authenticateCampaignAdmin}=await import('../src/lib/email-campaign-auth.ts')
const {campaignConfiguration}=await import('../src/lib/email-campaigns.ts')
const {META_FORM_LANGUAGES}=await import('../src/lib/lead-language.ts')
const root=new Client({host,port:55432,database:'postgres',user:process.env.USER||'hermes'});await root.connect()
const database='ec_resend_ui_'+randomUUID().replaceAll('-','');await root.query('create database '+database)
const db=new Client({host,port:55432,database,user:process.env.USER||'hermes'});await db.connect()
const admin=randomUUID(),client=randomUUID(),authUid=randomUUID()
await db.query(`create table buyers(id uuid primary key,is_admin boolean,name text,auth_user_id uuid);
 create table leads(id uuid primary key default gen_random_uuid(),name text,email text,state text,type text default 'hot',assigned_to uuid,lead_language text,form_name text,created_at timestamptz default now());`)
await db.query('insert into buyers(id,is_admin,name,auth_user_id) values($1,true,$2,$3),($4,false,$5,$6)',[admin,'Synthetic Admin',authUid,client,'Synthetic Client',randomUUID()])
const people=[['Synthetic Opened','opened@example.invalid','pt'],['Synthetic Clicked','clicked@example.invalid','es'],['Synthetic Quiet A','quiet-a@example.invalid','pt'],['Synthetic Quiet B','quiet-b@example.invalid','es'],['Synthetic Recent','recent@example.invalid','pt'],['Synthetic Bounced','bounced@example.invalid','pt']]
for(const [name,email,lang] of people)await db.query('insert into leads(name,email,state,lead_language,assigned_to) values($1,$2,$3,$4,$5)',[name,email,'FL',lang,client])
for(const m of ['062_admin_email_campaigns.sql','063_email_campaign_tracking_resend.sql'])await db.query(readFileSync(resolve(repo,'supabase/migrations/'+m),'utf8'))
let sendingCalls=0,trackingOn=true,trackingIssue
// Production-like shape: with an issue, the flags are off on paper too (Resend keeps them inactive until the Tracking CNAME is verified).
const tracking=()=>trackingIssue?{open:false,click:false,status:'not_verified',checked_at:new Date().toISOString(),issue:trackingIssue}:({open:trackingOn,click:trackingOn,status:'verified',checked_at:new Date().toISOString()})
const config=()=>campaignConfiguration({RESEND_API_KEY:'synthetic-only',RESEND_FROM_EMAIL:'seguro@example.invalid',MANUAL_EMAIL_POSTAL_ADDRESS:'Synthetic postal address',EMAIL_CAMPAIGN_WEBHOOK_SECRET:'synthetic-webhook',EMAIL_CAMPAIGNS_ENABLED:'true'})
const rpc=async(n,args)=>{try{assert.match(n,/^ec_[a-z_]+$/);const entries=Object.entries(args);entries.forEach(([k])=>assert.match(k,/^p_[a-z_]+$/));const r=await db.query(`select public.${n}(${entries.map(([k],i)=>`${k} => $${i+1}`).join(',')}) value`,entries.map(([,v])=>v));return {data:r.rows[0].value,error:null}}catch(e){return {data:null,error:{message:e.message}}}}
const handlers=createCampaignHandlers({authenticate:()=>authenticateCampaignAdmin({getUser:async()=>({data:{user:{id:authUid}},error:null}),buyers:()=>({select:()=>({eq:(column,uid)=>({single:async()=>({data:(await db.query('select id,is_admin from buyers where auth_user_id=$1',[uid])).rows[0]||null,error:null})})})})}),runtime:()=>({config:config(),provider:{verifyDomain:async()=>true,trackingStatus:async()=>tracking(),send:async()=>{sendingCalls++;throw new Error('REAL MAIL IS FORBIDDEN')}},db:{rpc}})})
// Build a completed origin campaign entirely through SQL (never through the provider).
const forms=JSON.stringify(META_FORM_LANGUAGES)
const sql=async(n,args)=>{const r=await rpc(n,args);if(r.error)throw new Error(r.error.message);return r.data}
await sql('ec_record_permission',{p_actor:admin,p_filters:'{}',p_forms:forms,p_evidence:'Synthetic documented insurance consent fixture',p_confirm:true})
const origin=await sql('ec_save',{p_actor:admin,p_id:null,p_data:JSON.stringify({name:'Synthetic Seguro origem',subject_pt:'Olá {{nome}}, proteção',body_pt:'Olá {{nome}}, conheça opções de seguro.',subject_es:'Hola {{nome}}, protección',body_es:'Hola {{nome}}, conoce opciones de seguro.',filters:{}})})
await sql('ec_schedule',{p_actor:admin,p_id:origin.id,p_at:new Date().toISOString(),p_forms:forms,p_expected:null,p_tracking:JSON.stringify(tracking())})
for(let i=0;i<people.length;i++){await db.query('update email_campaign_rate set minute_used=0,day_used=0');const r=await sql('ec_claim',{p_daily:200,p_tracking:JSON.stringify(tracking())});assert.ok(r);assert.equal(await sql('ec_authorize',{p_id:r.id,p_lease:r.lease}),true);await sql('ec_finish',{p_id:r.id,p_lease:r.lease,p_state:'accepted',p_provider:'prov-'+i,p_reason:null})}
const rows=(await db.query('select id,email,provider_id from email_campaign_recipients where campaign_id=$1',[origin.id])).rows
const by=email=>rows.find(r=>r.email===email)
const old=new Date(Date.now()-72*3600e3).toISOString(),recent=new Date(Date.now()-6*3600e3).toISOString()
await sql('ec_event',{p_event:'b-1',p_provider:by('bounced@example.invalid').provider_id,p_kind:'email.bounced',p_at:old})
for(const e of ['opened','clicked','quiet-a','quiet-b'])await sql('ec_event',{p_event:'d-'+e,p_provider:by(e+'@example.invalid').provider_id,p_kind:'email.delivered',p_at:old})
await sql('ec_event',{p_event:'d-recent',p_provider:by('recent@example.invalid').provider_id,p_kind:'email.delivered',p_at:recent})
await sql('ec_event',{p_event:'o-1',p_provider:by('opened@example.invalid').provider_id,p_kind:'email.opened',p_at:old})
await sql('ec_event',{p_event:'k-1',p_provider:by('clicked@example.invalid').provider_id,p_kind:'email.clicked',p_at:old})
await sql('ec_claim',{p_daily:200,p_tracking:JSON.stringify(tracking())})
assert.equal((await db.query('select state from email_campaigns where id=$1',[origin.id])).rows[0].state,'completed')
const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from '${resolve(repo,'src/app/admin/email-campaigns/page.tsx')}';createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:repo,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfig:resolve(repo,'tsconfig.json')})
const css=await postcss([tailwind({base:repo})]).process(readFileSync(resolve(repo,'src/app/globals.css'),'utf8'),{from:resolve(repo,'src/app/globals.css')})
const html=dark=>`<!doctype html><html lang="pt-BR"${dark?' class="dark"':''}><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${css.css}body{font-family:Arial,sans-serif;padding:24px;background:${dark?'#0f172a':'#f8fafc'}}#root{max-width:1160px;margin:auto}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`
const server=createServer(async(req,res)=>{
 if(req.url.startsWith('/api/admin/email-campaigns')){
  let raw='';for await(const chunk of req)raw+=chunk
  const request=new Request('http://127.0.0.1:'+server.address().port+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:raw}:{})})
  const response=await handlers[req.method](request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text())
 }else if(req.url==='/'||req.url==='/dark'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html(req.url==='/dark'))}else{res.writeHead(404);res.end()}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({headless:true,executablePath:'/home/hermes/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox']})
const errors=[],checks=[],screenshots=[]
async function shot(page,name){const p=resolve(out,name+'.png');await page.screenshot({path:p,fullPage:true});screenshots.push(p)}
function check(name,value){assert.ok(value,name);checks.push(name)}
// On failure, record what the browser and the database actually showed (no secrets: synthetic fixture only).
let lastPage=null
async function diagnose(error){
 const dom=lastPage&&!lastPage.isClosed()?await lastPage.evaluate(()=>({url:location.href,headings:[...document.querySelectorAll('h1,h2,h3')].map(h=>h.tagName+':'+h.textContent?.trim()),buttons:[...document.querySelectorAll('button')].map(b=>({name:b.textContent?.trim().slice(0,80),disabled:b.disabled})),alerts:[...document.querySelectorAll('[role=alert],[role=status]')].map(e=>e.textContent?.trim())})).catch(e=>({evaluate_error:e.message})):null
 const campaigns=(await db.query('select id,name,state,resend_of,created_at from email_campaigns order by created_at desc').catch(e=>({rows:[{query_error:e.message}]}))).rows
 const report={failed_at:new Date().toISOString(),error:error?.message,stack:error?.stack?.split('\n').slice(0,4),checks_passed:checks,dom,campaigns,page_errors:errors}
 writeFileSync(resolve(out,'email-campaign-resend-ui-failure.json'),JSON.stringify(report,null,2));console.error(JSON.stringify(report,null,2))
}
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}})
 await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort())
 const page=await context.newPage();lastPage=page;page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
 await page.goto(base);await page.getByRole('button',{name:/Synthetic Seguro origem/}).waitFor()
 check('List shows delivered and unopened per campaign',await page.getByText(/5 entregues/).count()===1&&await page.getByText(/3 sem abertura/).count()===1)
 await page.getByRole('button',{name:/Synthetic Seguro origem/}).click();await page.getByRole('heading',{name:'Resultados'}).waitFor()
 const metric=async label=>Number(await page.getByTestId('metric-'+label).textContent())
 check('Report totals: accepted 6, delivered 5, opened 1, clicked 1, unopened 3 (incl. recent), failed 1',await metric('accepted')===6&&await metric('delivered')===5&&await metric('opened')===1&&await metric('clicked')===1&&await metric('unopened')===3&&await metric('failed')===1)
 check('Rates use delivered as base',await page.getByText('20% dos entregues').count()===2)
 check('Tracking snapshot is explained, not assumed',await page.getByText(/rastreamento de abertura ativo/i).count()===1)
 await page.getByLabel('Filtrar contatos por engajamento',{exact:true}).selectOption('unopened');await page.getByText('Página 1 · 3 contatos').waitFor()
 const rowsShown=await page.locator('tbody tr').count()
 check('Unopened filter paginates in SQL with exact total',rowsShown===3&&await page.getByText('quiet-a@example.invalid').count()===1&&await page.getByText('recent@example.invalid').count()===1&&await page.getByText('quiet-b@example.invalid').count()===1)
 await page.getByLabel('Filtrar contatos por engajamento',{exact:true}).selectOption('clicked');await page.getByText('Página 1 · 1 contatos').waitFor()
 check('Clicked row shows click date and no open date',await page.locator('tbody tr').count()===1&&await page.getByText('Clique em',{exact:false}).count()===1)
 await page.getByLabel('Filtrar contatos por engajamento',{exact:true}).selectOption('')
 await page.getByText('Prévia do conteúdo',{exact:true}).click();await shot(page,'email-campaign-report-desktop')
 // Resend preview: 2 quiet contacts eligible, each exclusion explained.
 await page.getByRole('button',{name:'Preparar reenvio',exact:true}).click();await page.getByText('2 contatos sem abertura há mais de 48h',{exact:false}).waitFor()
 check('Preview lists exclusions',await page.getByText(/1 abriram/).count()===1&&await page.getByText(/1 clicaram/).count()===1&&await page.getByText(/1 entregues há menos de 48h/).count()===1&&await page.getByText(/1 não entregues/).count()===1)
 check('Nothing was created by the preview',(await db.query('select count(*)::int n from email_campaigns')).rows[0].n===1)
 await shot(page,'email-campaign-resend-preview-desktop')
 // A quiet contact opens between preview and creation: the draft reflects the new count.
 await sql('ec_event',{p_event:'o-late',p_provider:by('quiet-b@example.invalid').provider_id,p_kind:'email.opened',p_at:new Date().toISOString()})
 await page.getByRole('button',{name:'Criar rascunho do reenvio',exact:true}).click();await page.getByText('Rascunho do reenvio criado.',{exact:false}).waitFor()
 check('Resend draft is linked, in draft state, with no recipients',(await db.query("select count(*)::int n from email_campaigns where resend_of=$1 and state='draft'",[origin.id])).rows[0].n===1&&(await db.query('select count(*)::int n from email_campaign_recipients where campaign_id<>$1',[origin.id])).rows[0].n===0)
 await page.getByText(/Nenhum e-mail é enviado até você agendar/).waitFor();check('Draft editor shows origin link and resend warning',await page.getByText('Reenvio de',{exact:false}).count()>=1&&await page.getByText(/Nenhum e-mail é enviado até você agendar/).count()===1)
 await page.getByRole('button',{name:'Conferir público',exact:true}).click();await page.getByText('destinatários originais',{exact:false}).waitFor();check('Resend audience is the frozen origin list, down to 1 after the late open',/1contato sem abertura · 1 PT \/ 0 ES/.test((await page.locator('.bg-emerald-50').first().textContent())||''))
 await page.setViewportSize({width:390,height:844});await shot(page,'email-campaign-resend-draft-mobile')
 check('Mobile resend draft has no page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.setViewportSize({width:1280,height:900})
 // Double submit on the origin never creates a second draft.
 await page.getByRole('button',{name:'Synthetic Seguro origem',exact:true}).click();await page.getByRole('heading',{name:'Resultados'}).waitFor()
 await page.getByRole('button',{name:'Abrir reenvio preparado',exact:true}).waitFor()
 check('Origin now links to the existing resend instead of offering another',await page.getByRole('button',{name:'Preparar reenvio',exact:true}).count()===0)
 const dup=await Promise.all([0,1].map(()=>fetch(base+'/api/admin/email-campaigns',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({action:'resend_create',id:origin.id})})))
 check('Concurrent create returns the same draft',dup.every(r=>r.status===200)&&(await db.query('select count(*)::int n from email_campaigns where resend_of=$1',[origin.id])).rows[0].n===1)
 // Tracking disabled now: creating/scheduling a resend is blocked.
 trackingOn=false
 const blocked=await fetch(base+'/api/admin/email-campaigns',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({action:'resend_create',id:origin.id})})
 check('Tracking off blocks resend creation with 409',blocked.status===409)
 // Before any first scheduling, the editor must warn that opens AND clicks are not confirmed (production-like: flags on paper, DNS not verified), without blocking the button.
 // Tracking is read on every list load, so go back to the list first.
 trackingIssue='tracking_dns_not_verified'
 await page.getByRole('button',{name:'Campanhas',exact:true}).click();await page.getByRole('button',{name:'Nova campanha',exact:true}).click();await page.getByRole('heading',{name:'Agendamento'}).waitFor()
 const warning=page.getByRole('status').filter({hasText:/abertura e clique não confirmado/})
 await warning.waitFor();await shot(page,'email-campaign-new-tracking-warning')
 check('New campaign warns opens+clicks unconfirmed and names the DNS cause, without blocking scheduling',await warning.count()===1&&/registro DNS de rastreamento ainda não verificado/.test((await warning.textContent())||'')&&await page.getByRole('button',{name:'Agendar campanha',exact:true}).count()===1)
 check('Warning never shows provider record values',!/synthetic|CNAME|example\.invalid/i.test((await warning.textContent())||''))
 trackingOn=true;trackingIssue=undefined
 await page.getByRole('button',{name:'Campanhas',exact:true}).click();await page.getByRole('button',{name:/^Synthetic Seguro origem/}).waitFor();await page.getByRole('button',{name:'Nova campanha',exact:true}).click();await page.getByRole('heading',{name:'Agendamento'}).waitFor()
 check('Warning disappears once opens and clicks are confirmed',await page.getByRole('status').filter({hasText:/abertura e clique não confirmado/}).count()===0)
 // Dark mode report
 const dark=await context.newPage();lastPage=dark;dark.on('pageerror',e=>errors.push(e.message))
 await dark.goto(base+'/dark');const originRow=dark.getByRole('button',{name:/^Synthetic Seguro origem/}),resendRow=dark.getByRole('button',{name:/^Reenvio · Synthetic Seguro origem/})
 await originRow.waitFor()
 // The list is newest-first, so the resend draft ("Reenvio · …") precedes the origin: a bare /Synthetic Seguro origem/ .first() would open the draft, which has no "Resultados".
 const listOrder=await dark.locator('section button p.font-medium').allTextContents()
 check('List shows the resend draft labelled as a resend, before the origin',await resendRow.count()===1&&await originRow.count()===1&&listOrder[0]==='Reenvio · Synthetic Seguro origem'&&listOrder[1]==='Synthetic Seguro origem'&&await dark.getByText(/^Reenvio · 0 destinatários/).count()===1)
 await originRow.click();await dark.getByRole('heading',{name:'Resultados'}).waitFor()
 check('Click metric says it counts any e-mail link, footer included, and automatic filters',await dark.getByTitle(/cliques em links do e-mail, inclusive rodapé; filtros automáticos podem contar/).count()===1)
 await dark.getByText('Prévia do conteúdo',{exact:true}).click();await shot(dark,'email-campaign-report-dark')
 await dark.setViewportSize({width:390,height:844});await shot(dark,'email-campaign-report-mobile-dark')
 check('Mobile report has no page overflow',await dark.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 // The worker pause reason is stored in SQL and must reach the real admin page through ec_list.
 const draftId=(await db.query('select id from email_campaigns where resend_of=$1',[origin.id])).rows[0].id
 await db.query("update email_campaigns set state='paused',pause_reason='tracking_not_confirmed' where id=$1",[draftId])
 await dark.getByRole('button',{name:'Campanhas',exact:true}).click()
 await dark.getByRole('button',{name:/^Reenvio · Synthetic Seguro origem/}).click()
 const pausedNotice=dark.getByText(/^Pausada automaticamente: o provedor não confirma mais o rastreamento/)
 await pausedNotice.waitFor()
 check('Paused tracking reason reaches the real page via SQL and explains manual resume',await pausedNotice.count()===1&&/retome a campanha/i.test(await pausedNotice.textContent())&&await dark.getByRole('button',{name:'Retomar',exact:true}).isEnabled())
 await shot(dark,'email-campaign-tracking-paused-mobile-dark')
 check('No browser console errors',errors.length===0)
 check('No provider sending calls',sendingCalls===0)
 check('Origin rows untouched',(await db.query("select count(*)::int n from email_campaign_recipients where campaign_id=$1 and provider_id is not null",[origin.id])).rows[0].n===6)
 const result={executed_at:new Date().toISOString(),database,passed:checks.length,checks,screenshots,errors,sendingCalls,source:'Actual page + local PostgreSQL + actual API handlers with injected admin/provider (synthetic)'}
 writeFileSync(resolve(out,'email-campaign-resend-ui-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}catch(e){await diagnose(e);throw e}finally{await browser.close();await new Promise(r=>server.close(r));await db.end();await root.end()}
