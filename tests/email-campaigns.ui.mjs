// Real UI + real local SQL + real HTTP handlers. All contacts and provider replies are synthetic.
// Requires EC_TEST_SOCKET (Unix socket) and EC_TEST_TOOL_DIR with playwright/pg.
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
const root=new Client({host,port:55432,database:'postgres',user:process.env.USER||'hermes'});await root.connect()
const database='ec_ui_'+randomUUID().replaceAll('-','');await root.query('create database '+database)
const db=new Client({host,port:55432,database,user:process.env.USER||'hermes'});await db.connect()
const admin=randomUUID(),client=randomUUID(),authUid=randomUUID()
await db.query(`create table buyers(id uuid primary key,is_admin boolean,name text,auth_user_id uuid);
 create table leads(id uuid primary key default gen_random_uuid(),name text,email text,state text,type text default 'hot',assigned_to uuid,lead_language text,form_name text,created_at timestamptz default now());`)
await db.query('insert into buyers(id,is_admin,name,auth_user_id) values($1,true,$2,$5),($3,false,$4,$6)',[admin,'Synthetic Admin',client,'Synthetic Client',authUid,randomUUID()])
await db.query("insert into leads(name,email,state,lead_language,assigned_to) values('Synthetic Maria','maria@example.invalid','FL','pt',$1),('Synthetic Ana','ana@example.invalid','NH','es',$1),('Synthetic Repeated','maria@example.invalid','FL','pt',null),('Synthetic Invalid','bad','FL','pt',null)",[client])
await db.query(readFileSync(resolve(repo,'supabase/migrations/062_admin_email_campaigns.sql'),'utf8'))
let sendingCalls=0,ready=true,denySave=false
const config=()=>campaignConfiguration({RESEND_API_KEY:'synthetic-only',RESEND_FROM_EMAIL:'seguro@example.invalid',MANUAL_EMAIL_POSTAL_ADDRESS:'Synthetic postal address',EMAIL_CAMPAIGN_WEBHOOK_SECRET:'synthetic-webhook',EMAIL_CAMPAIGNS_ENABLED:ready?'true':'false'})
const handlers=createCampaignHandlers({authenticate:()=>authenticateCampaignAdmin({getUser:async()=>({data:{user:{id:authUid}},error:null}),buyers:()=>({select:columns=>{assert.equal(columns,'id,is_admin');return {eq:(column,uid)=>{assert.equal(column,'auth_user_id');return {single:async()=>({data:(await db.query('select id,is_admin from buyers where auth_user_id=$1',[uid])).rows[0]||null,error:null})}}}}})}),runtime:()=>({config:config(),provider:{verifyDomain:async()=>true,send:async()=>{sendingCalls++;throw new Error('REAL MAIL IS FORBIDDEN')}},db:{rpc:async(n,args)=>{
 if(denySave&&n==='ec_save')return {data:null,error:{message:'synthetic database failure'}}
 try{assert.match(n,/^ec_[a-z_]+$/);const entries=Object.entries(args);entries.forEach(([k])=>assert.match(k,/^p_[a-z_]+$/));const r=await db.query(`select public.${n}(${entries.map(([k],i)=>`${k} => $${i+1}`).join(',')}) value`,entries.map(([,v])=>v));return {data:r.rows[0].value,error:null}}catch(e){return {data:null,error:{message:e.message}}}
}}})})
const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from '${resolve(repo,'src/app/admin/email-campaigns/page.tsx')}';createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:repo,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfig:resolve(repo,'tsconfig.json')})
const css=await postcss([tailwind({base:repo})]).process(readFileSync(resolve(repo,'src/app/globals.css'),'utf8'),{from:resolve(repo,'src/app/globals.css')})
const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${css.css}body{font-family:Arial,sans-serif;padding:24px; background:#f8fafc}#root{max-width:1160px;margin:auto}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`
const server=createServer(async(req,res)=>{
 if(req.url.startsWith('/api/admin/email-campaigns')){
  let raw='';for await(const chunk of req)raw+=chunk
  const request=new Request('http://127.0.0.1:'+server.address().port+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:raw}:{})})
  const response=await handlers[req.method](request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text())
 }else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html)}else{res.writeHead(404);res.end()}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const origin='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({headless:true,executablePath:'/home/hermes/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox']})
const errors=[],checks=[],screenshots=[]
async function shot(page,name){const p=resolve(out,name+'.png');await page.screenshot({path:p,fullPage:true});screenshots.push(p)}
function check(name,value){assert.ok(value,name);checks.push(name)}
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}})
 await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort())
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
 await page.goto(origin);await page.getByText('Sua primeira campanha começa aqui').waitFor()
 await page.getByRole('button',{name:'Nova campanha',exact:true}).click()
 await page.getByLabel('Nome da campanha',{exact:true}).fill('Synthetic Seguro outubro')
 await page.getByLabel('Assunto em português',{exact:true}).fill('Olá {{nome}}, sua família protegida')
 await page.getByLabel('Mensagem em português',{exact:true}).fill('Olá {{nome}}, conheça opções de seguro para sua família.\nhttps://example.invalid/seguro')
 await page.getByRole('button',{name:'Español',exact:true}).click()
 await page.getByLabel('Asunto en español',{exact:true}).fill('Hola {{nome}}, tu familia protegida')
 await page.getByLabel('Mensaje en español',{exact:true}).fill('Hola {{nome}}, conoce opciones de seguro para tu familia.')
 denySave=true;await page.getByRole('button',{name:'Salvar rascunho'}).click();await page.getByRole('alert').waitFor()
 check('Failed save preserves authored copy',await page.getByLabel('Mensaje en español',{exact:true}).inputValue()==='Hola {{nome}}, conoce opciones de seguro para tu familia.')
 denySave=false;await page.getByRole('button',{name:'Salvar rascunho'}).click();await page.getByText('Rascunho salvo. Nenhum e-mail foi enviado.').waitFor()
 await page.getByRole('button',{name:'Conferir público'}).click();await page.getByText('Registrar permissão de contato',{exact:true}).waitFor()
 check('Scheduling is blocked without eligible recipients',await page.getByRole('button',{name:'Agendar campanha'}).isDisabled())
 await page.getByText('Registrar permissão de contato',{exact:true}).click()
 await page.getByLabel('Origem da permissão',{exact:true}).fill('Documented synthetic insurance consent fixture')
 await page.getByRole('checkbox',{name:/Confirmo que os 2 contatos/}).check()
 await page.getByRole('button',{name:'Registrar, sem enviar'}).click();await page.getByText('endereços liberados · 1 PT / 1 ES',{exact:false}).waitFor()
 check('Permission never sends mail',sendingCalls===0)
 await page.getByRole('button',{name:'Português',exact:true}).click();await page.getByText('Prévia do conteúdo',{exact:true}).click()
 await shot(page,'email-campaign-editor-desktop')
 await page.setViewportSize({width:390,height:844});await shot(page,'email-campaign-editor-mobile')
 check('Mobile editor has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.setViewportSize({width:1280,height:900})
 await page.getByRole('checkbox',{name:/Conferi o conteúdo nos dois idiomas/}).check()
 await page.getByRole('button',{name:'Agendar campanha'}).click();await page.getByRole('button',{name:'Pausar',exact:true}).waitFor()
 check('Scheduling freezes editor',await page.getByLabel('Nome da campanha',{exact:true}).isDisabled())
 check('Exactly two unique, client-owned recipients are queued',(await db.query('select count(*)::int n from email_campaign_recipients')).rows[0].n===2)
 await page.getByRole('button',{name:'Pausar',exact:true}).click();await page.getByRole('button',{name:'Retomar',exact:true}).waitFor()
 await shot(page,'email-campaign-results-desktop')
 await page.getByRole('button',{name:'Retomar',exact:true}).click();await page.getByRole('button',{name:'Pausar',exact:true}).waitFor()
 await page.getByRole('button',{name:'Cancelar campanha',exact:true}).click();await page.getByText('Fila cancelada. Envios anteriores foram preservados.').waitFor()
 check('Cancelled queue does not alter lead ownership',(await db.query('select count(*)::int n from leads where assigned_to=$1',[client])).rows[0].n===2)
 check('Every queued recipient is cancelled',(await db.query("select count(*)::int n from email_campaign_recipients where state='cancelled'")).rows[0].n===2)
 await page.setViewportSize({width:390,height:844});await shot(page,'email-campaign-results-mobile')
 check('Mobile results have no page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.getByRole('button',{name:'Campanhas',exact:true}).click();await page.getByText('Suas campanhas',{exact:false}).waitFor()
 check('History shows the saved campaign',await page.getByRole('button',{name:/Synthetic Seguro outubro/}).count()===1)
 ready=false;await page.getByRole('button',{name:'Atualizar campanhas',exact:true}).click();await page.getByText('Disparos bloqueados.',{exact:true}).waitFor()
 check('Disabled configuration is visibly blocked',await page.getByText('Disparos bloqueados.',{exact:true}).isVisible())
 check('No browser console errors',errors.length===0)
 check('No provider sending calls',sendingCalls===0)
 const result={executed_at:new Date().toISOString(),database,passed:checks.length,checks,screenshots,errors,sendingCalls,source:'Actual page + local PostgreSQL + actual API handlers with injected admin/provider'}
 writeFileSync(resolve(out,'email-campaign-ui-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
}finally{await browser.close();await new Promise(r=>server.close(r));await db.end();await root.end()}
