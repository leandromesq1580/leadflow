// Mounted production menu/modal, loopback-only synthetic API; never sends messages or touches production.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const tools=process.env.NEWLEAD_UI_TOOLS,output=process.env.NEWLEAD_UI_OUTPUT
if(!tools||!output)throw new Error('NEWLEAD_UI_TOOLS and NEWLEAD_UI_OUTPUT required')
mkdirSync(output,{recursive:true})
const require=createRequire(root+'/package.json'),toolRequire=createRequire(tools+'/package.json')
const esbuild=require('esbuild'),{chromium}=toolRequire('playwright')
const postcss=require('postcss'),tailwind=require('@tailwindcss/postcss')
const source='11111111-1111-4111-8111-111111111111',buyer='22222222-2222-4222-8222-222222222222'
const second='33333333-3333-4333-8333-333333333333',empty='44444444-4444-4444-8444-444444444444'
const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{CardAssignMenu}from'${root}/src/app/dashboard/pipeline/card-assign-menu.tsx';window.assigned=0;createRoot(document.getElementById('root')).render(<div><h1>Synthetic Lead</h1><CardAssignMenu leadId="${source}" members={[{id:'member',name:'Equipe sintética'}]} canAssignAsNew={!location.search.includes('ordinary')} onAssigned={()=>{window.assigned++}}/></div>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfig:root+'/tsconfig.json'})
const css=await postcss([tailwind({base:root})]).process(readFileSync(root+'/src/app/globals.css','utf8'),{from:root+'/src/app/globals.css'})
let mode='normal',posts=[],getCalls=[],deliveries=0
const available=[{id:buyer,name:'Cliente de fora do time',email:'client@example.invalid',remaining:3,eligible:true},{id:empty,name:'Cliente sem saldo',email:'empty@example.invalid',remaining:0,eligible:false,reason:'no_credit'}]
const server=createServer(async(req,res)=>{
 if(req.url.startsWith('/api/admin/leads/assign-as-new')){
  if(req.method==='GET'){
   getCalls.push(req.url)
   if(mode==='list-error'){res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Consulta temporariamente indisponível.'}))}
   const url=new URL(req.url,'http://127.0.0.1'),next=url.searchParams.get('cursor')
   const buyers=next?[{id:second,name:'Outro cliente',email:'second@example.invalid',remaining:5,eligible:true}]:available.filter(b=>b.name.toLowerCase().includes((url.searchParams.get('q')||'').toLowerCase()))
   res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({lead:{id:source,name:'Synthetic Lead',language:'pt'},buyers,next_cursor:next?null:second}))
  }
  let raw='';for await(const chunk of req)raw+=chunk
  const body=JSON.parse(raw);posts.push(body)
  if(mode==='no-credit'){res.writeHead(409,{'Content-Type':'application/json'});return res.end(JSON.stringify({code:'NO_CREDIT',error:'O cliente ficou sem crédito. Nada foi alterado.'}))}
  const replay=posts.slice(0,-1).some(p=>p.request_id===body.request_id)
  if(!replay)deliveries++
  if(mode==='lost')return req.socket.destroy()
  await new Promise(r=>setTimeout(r,200))
  res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({success:true,lead_id:'55555555-5555-4555-8555-555555555555',source_lead_id:source,buyer_id:body.to_buyer_id,assigned_at:new Date().toISOString(),remaining:2,replayed:replay,notifications_pending:true}))
 }
 res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}body{font-family:Arial;background:#f4f6f9;padding:24px}#root{background:white;width:290px;padding:20px;border-radius:14px}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`)
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({headless:true,executablePath:process.env.NEWLEAD_CHROME||'/home/hermes/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox']})
const checks=[],errors=[];let page
const check=(label,value)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label)}
async function fresh(query=''){
 mode='normal';posts=[];getCalls=[];deliveries=0
 const context=await browser.newContext({viewport:{width:1280,height:850}})
 await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort())
 const p=await context.newPage();p.setDefaultTimeout(5000);p.on('pageerror',e=>errors.push(e.message));await p.goto(base+query);return p
}
async function open(p){await p.getByRole('button',{name:'Atribuir ao time',exact:true}).click();await p.getByRole('button',{name:'Atribuir lead como novo',exact:true}).click();await p.getByRole('dialog').waitFor()}
try{
 page=await fresh();await open(page)
 await page.getByRole('button',{name:/Cliente de fora do time/}).waitFor()
 check('existing assignment remains separate; new menu opens without writes',posts.length===0)
 check('confirmation is disabled until a recipient is chosen',await page.getByRole('button',{name:'Entregar e descontar 1 crédito',exact:true}).isDisabled())
 check('all-tool recipient outside team is listed',await page.getByRole('button',{name:/Cliente de fora do time/}).count()===1)
 check('recipient without language credit is disabled',await page.getByRole('button',{name:/Cliente sem saldo/}).isDisabled())
 check('eligibility reason is human readable, not a database code',await page.getByRole('button',{name:/Cliente sem saldo/}).textContent().then(t=>!t.includes('no_credit')&&t.includes('Sem crédito válido')))
 await page.getByRole('button',{name:'Carregar mais',exact:true}).click();await page.getByRole('button',{name:/Outro cliente/}).waitFor();check('recipient pagination is reachable',getCalls.some(u=>u.includes('cursor=')))
 await page.getByRole('button',{name:/Cliente de fora do time/}).click()
 await page.screenshot({path:resolve(output,'assign-new-desktop.png'),fullPage:true})
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(output,'assign-new-mobile.png'),fullPage:true})
 check('mobile dialog fits viewport',await page.getByRole('dialog').evaluate(e=>{const b=e.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight}))
 await page.getByRole('button',{name:'Entregar e descontar 1 crédito',exact:true}).evaluate(e=>{e.click();e.click()})
 await page.getByText('Lead entregue como novo.',{exact:true}).waitFor()
 check('double click sends one charge request',posts.length===1&&deliveries===1)
 check('explicit UUID operation matches chosen source and buyer',posts[0].lead_id===source&&posts[0].to_buyer_id===buyer&&/^[0-9a-f-]{36}$/.test(posts[0].request_id))
 check('success says notifications may still be pending',await page.getByText(/aviso.*pendente/i).count()>0)
 await page.getByRole('button',{name:'Concluir',exact:true}).click();check('parent board reloads after completed delivery',await page.evaluate(()=>window.assigned)===1)
 page=await fresh('?ordinary');await page.getByRole('button',{name:'Atribuir ao time',exact:true}).click();check('ordinary user does not see paid new assignment',await page.getByRole('button',{name:'Atribuir lead como novo',exact:true}).count()===0)
 check('ordinary member assignment is preserved',await page.getByRole('button',{name:'Equipe sintética',exact:true}).count()===1)
 page=await fresh();mode='list-error';await open(page);await page.getByRole('alert').waitFor();check('failed lookup is shown instead of fake empty list',await page.getByRole('alert').textContent().then(t=>t.includes('indisponível')));mode='normal';await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await page.getByRole('button',{name:/Cliente de fora do time/}).waitFor()
 await page.getByRole('button',{name:/Cliente de fora do time/}).click();mode='no-credit';await page.getByRole('button',{name:'Entregar e descontar 1 crédito',exact:true}).click();await page.getByRole('alert').waitFor();check('credit race keeps dialog and makes no delivery',deliveries===0&&await page.getByRole('dialog').count()===1)
 page=await fresh();await open(page);await page.getByRole('button',{name:/Cliente de fora do time/}).click();mode='lost';await page.getByRole('button',{name:'Entregar e descontar 1 crédito',exact:true}).click();await page.getByRole('alert').waitFor();check('lost response locks target and explains verification',await page.getByRole('button',{name:/Cliente de fora do time/}).isDisabled())
 const attemptsBeforeReopen=posts.length,lookupsBeforeReopen=getCalls.length;await page.getByRole('button',{name:'Fechar',exact:true}).click();await open(page);await page.getByRole('button',{name:'Conferir entrega',exact:true}).waitFor();check('closing and reopening preserves pending recipient and operation without a new lookup',posts.length===attemptsBeforeReopen&&getCalls.length===lookupsBeforeReopen&&await page.getByRole('button',{name:/Cliente de fora do time/}).isDisabled())
 mode='normal';await page.getByRole('button',{name:'Conferir entrega',exact:true}).click();await page.getByText('Lead entregue como novo.',{exact:true}).waitFor();check('ambiguous retry reuses exact operation and does not debit twice',posts.length>=2&&posts.every(p=>p.request_id===posts[0].request_id&&p.to_buyer_id===posts[0].to_buyer_id)&&deliveries===1)
 check('no browser errors',errors.length===0)
 writeFileSync(resolve(output,'result.json'),JSON.stringify({checked_at:new Date().toISOString(),passed:checks.length,checks,errors},null,2))
}catch(e){writeFileSync(resolve(output,'failure.json'),JSON.stringify({at:new Date().toISOString(),message:e.message,checks,errors,dom:page?await page.locator('body').innerText():null},null,2));throw e}
finally{await browser.close();await new Promise(r=>server.close(r))}
