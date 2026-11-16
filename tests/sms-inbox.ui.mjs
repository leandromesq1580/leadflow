// Real mounted components; synthetic loopback-only HTTP. No production credentials.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const tools=process.env.SMS_UI_TOOLS, output=process.env.SMS_UI_OUTPUT
if(!tools||!output) throw Error('SMS_UI_TOOLS and SMS_UI_OUTPUT required')
mkdirSync(output,{recursive:true})
const require=createRequire(root+'/package.json'),toolRequire=createRequire(tools+'/package.json')
const esbuild=require('esbuild'),{chromium}=toolRequire('playwright')
const stubs={
 '@/lib/use-realtime': 'export function useRealtime() {}',
 '@/lib/i18n-client': 'export function useT(){return {_locale:"pt",sidebar:{dashboard:"Início",pipeline:"Pipeline",whatsapp:"WhatsApp",appointments:"Agenda",community:"Comunidade",team:"Equipe",billing:"Créditos",settings:"Configurações"}}}',
 '@/components/locale-switcher': 'export function LocaleSwitcher(){return null}',
 'next/navigation': 'export function usePathname(){return "/dashboard/whatsapp"};export function useParams(){return {leadId:"lead"}};export function useRouter(){return {back(){}}}',
 'next/link': 'import React from "react";export default function Link(p){return React.createElement("a",p,p.children)}',
}
const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{WhatsAppInbox}from'${root}/src/components/whatsapp-inbox.tsx';import MobileThread from'${root}/src/app/m/whatsapp/[leadId]/page.tsx';import{TopBar}from'${root}/src/components/dashboard/topbar.tsx';window.events=0;window.addEventListener('wa-unread-changed',()=>window.events++);const app=createRoot(document.getElementById('root'));window.mount=(lead='lead')=>app.render(<><TopBar buyerId="buyer"/>{lead&&(location.pathname==='/mobile'?<MobileThread/>:<WhatsAppInbox leadId={lead} buyerId="buyer"/>)}</>);window.mount();`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfig:root+'/tsconfig.json',plugins:[{name:'offline-boundaries',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'stub'}:null);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js',resolveDir:root}))}}]})
let mode='normal', patches=[], reads=0, badgeReads=0, read=false
const row={id:'sms-00000000-0000-0000-0000-000000000401',lead_id:'lead',direction:'in',body:'Resposta SMS sintética',channel:'sms',sent_at:'2026-11-16T12:00:00Z',status:'received',read_at:null}
const server=createServer(async(req,res)=>{
 const send=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body))}
 if(req.url.startsWith('/api/whatsapp/messages')){
  if(req.method==='PATCH') {let raw='';for await(const c of req)raw+=c;patches.push(JSON.parse(raw));if(mode==='patch-fail')return send({error:'unavailable'},503);read=true;return send({success:true})}
  reads++;if(mode==='get-fail')return send({error:'unavailable'},503)
  if(mode==='slow')await new Promise(r=>setTimeout(r,350))
  return send({messages:[{...row,read_at:read?'2026-11-16T13:00:00Z':null}]})
 }
 if(req.url.startsWith('/api/whatsapp/unread')){badgeReads++;const snapshot={total:read?0:1,counts:read?{}:{lead:1}};if(mode==='slow-badge'&&badgeReads===1)await new Promise(r=>setTimeout(r,350));return send(snapshot)}
 if(req.url.startsWith('/api/m/team-context'))return send({buyer_id:'buyer'})
 if(req.url.startsWith('/api/leads/'))return send({lead:null})
 if(req.url.startsWith('/api/home'))return send({remaining:1})
 if(req.url.startsWith('/api/community'))return send({unread:0})
 if(req.url.startsWith('/api/appointments'))return send({events:[]})
 if(req.url.startsWith('/api/speed-to-lead'))return send({leads:[]})
 res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><html><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`)
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({headless:true,...(process.env.SMS_UI_CHROME?{executablePath:process.env.SMS_UI_CHROME}:{}),args:['--no-sandbox']})
const checks=[],errors=[]
const check=(label,value)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label)}
async function fresh(next='normal',hidden=false,mobile=false){
 mode=next;patches=[];reads=0;badgeReads=0;read=false
 const context=await browser.newContext();await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort())
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000)
 if(hidden)await page.addInitScript(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}))
 await page.goto(base+(mobile?'/mobile':''));return {page,context}
}
try{
 let {page,context}=await fresh('slow')
 await page.waitForTimeout(120);check('no PATCH before the thread GET succeeds',patches.length===0)
 await page.getByText(row.body,{exact:true}).waitFor();await page.waitForFunction(()=>window.events===1)
 check('one SMS bubble, no mirrored WhatsApp duplicate',await page.getByText(row.body,{exact:true}).count()===1)
 check('read only the displayed SMS snapshot',patches.length===1&&patches[0].sms_ids.length===1&&patches[0].sms_ids[0]===row.id.slice(4))
 await page.waitForTimeout(100);check('bell refreshes immediately after confirmed read',badgeReads>=2)
 check('successful load emits the existing unread refresh event',await page.evaluate(()=>window.events)===1)
 await context.close()
 ;({page,context}=await fresh('get-fail'));await page.waitForTimeout(300)
 check('failed load does not mark unseen messages read',patches.length===0&&await page.evaluate(()=>window.events)===0);await context.close()
 ;({page,context}=await fresh('patch-fail'));await page.getByText(row.body,{exact:true}).waitFor();await page.waitForTimeout(150)
 check('failed PATCH does not announce successful read',patches.length===1&&await page.evaluate(()=>window.events)===0)
 await page.getByRole('button',{name:'Notificações',exact:true}).click()
 check('bell names SMS and counts messages, not conversations',await page.getByText('1 mensagem não lida · WhatsApp / SMS',{exact:true}).count()===1);await context.close()
 ;({page,context}=await fresh('normal',true));await page.getByText(row.body,{exact:true}).waitFor()
 check('hidden tab does not consume unread SMS',patches.length===0)
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))})
 await page.waitForFunction(()=>window.events===1);check('return to visible thread acknowledges successfully',patches.length===1);await context.close()
 ;({page,context}=await fresh('slow'));await page.evaluate(()=>window.mount(null));await page.waitForTimeout(500)
 check('unmounted thread does not acknowledge late GET',patches.length===0);await context.close()
 ;({page,context}=await fresh('slow-badge'));await page.waitForFunction(()=>window.events===1);await page.waitForTimeout(500)
 check('read event during initial badge request is replayed, not lost',badgeReads>=2);await context.close()
 ;({page,context}=await fresh('slow',false,true));await page.waitForTimeout(120)
 check('mobile does not mark read in parallel with the GET',patches.length===0)
 await page.getByText(row.body,{exact:true}).waitFor();await page.waitForFunction(()=>window.events===1)
 check('mobile acknowledges the displayed SMS snapshot',patches.length===1&&patches[0].sms_ids[0]===row.id.slice(4));await context.close()
 ;({page,context}=await fresh('get-fail',false,true));await page.waitForTimeout(300)
 check('mobile failed GET leaves unread intact',patches.length===0);await context.close()
 ;({page,context}=await fresh('normal',true,true));await page.getByText(row.body,{exact:true}).waitFor()
 check('mobile hidden tab leaves unread intact',patches.length===0);await context.close()
 check('no browser runtime errors',errors.length===0)
 writeFileSync(resolve(output,'result.json'),JSON.stringify({checks,errors,passed:checks.length},null,2))
}finally{await browser.close();await new Promise(r=>server.close(r))}
