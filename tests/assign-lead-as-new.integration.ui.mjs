// Browser -> real assignment handlers -> real migration/receipt SQL. Synthetic auth/data only.
// Run: NEWLEAD_UI_TOOLS=... NEWLEAD_UI_OUTPUT=... node --import tsx tests/assign-lead-as-new.integration.ui.mjs
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fixture,uuid } from './admin-new-lead-assignment-fixture.ts'
import { createAdminNewLeadAssignmentHandlers } from '../src/lib/admin-new-lead-assignment.ts'
import { drainAdminNewLeadAssignmentEffects } from '../src/lib/admin-new-lead-assignment-effects.ts'
const output=process.env.NEWLEAD_UI_OUTPUT,tools=process.env.NEWLEAD_UI_TOOLS
if(!output||!tools)throw new Error('NEWLEAD_UI_OUTPUT and NEWLEAD_UI_TOOLS required')
mkdirSync(output,{recursive:true})
const root=process.cwd(),require=createRequire(root+'/package.json'),{chromium}=createRequire(tools+'/package.json')('playwright')
const {db,q}=await fixture(),calls=[],checks=[]
let postCount=0,server,browser
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name)}
const rpc=async(name,args)=>{
 const signatures={admin_new_lead_assignment_options:['p_actor','p_source','p_query','p_cursor','p_limit'],admin_assign_lead_as_new:['p_actor','p_source','p_buyer','p_request'],admin_new_lead_assignment_status:['p_actor','p_source','p_request'],claim_admin_new_lead_effect:['p_kind'],finish_admin_new_lead_effect:['p_id','p_token','p_state']}
 assert.ok(signatures[name],`permitted fixture RPC ${name}`)
 calls.push(name)
 try {const fields=signatures[name];return {data:(await q(`select ${name}(${fields.map((_,i)=>'$'+(i+1)).join(',')}) result`,fields.map(f=>args[f])))[0].result,error:null}}
 catch(error){return {data:null,error:{message:error.message,code:error.code}}}
}
const handler=createAdminNewLeadAssignmentHandlers({actor:async()=>({id:uuid(11),is_admin:true}),rpc})
try {
 const bundle=await require('esbuild').build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{CardAssignMenu}from'${root}/src/app/dashboard/pipeline/card-assign-menu.tsx';createRoot(document.getElementById('root')).render(<CardAssignMenu leadId="${uuid(41)}" members={[]} canAssignAsNew onAssigned={()=>{window.completed=true}}/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfig:root+'/tsconfig.json'})
 const css=await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process(readFileSync(root+'/src/app/globals.css','utf8'),{from:root+'/src/app/globals.css'})
 server=createServer(async(req,res)=>{
  try {
   if(req.url.startsWith('/api/admin/leads/assign-as-new')){
    let raw='';for await(const chunk of req)raw+=chunk
    const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:{'Content-Type':'application/json'},...(req.method==='POST'?{body:raw}:{})})
    if(req.method==='POST')postCount++
    const response=await handler[req.method](request)
    res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(await response.text())
   }
   res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}body{font-family:Arial;padding:24px}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`)
  }catch(error){res.writeHead(500);res.end(String(error))}
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const base='http://127.0.0.1:'+server.address().port
 browser=await chromium.launch({headless:true,executablePath:process.env.NEWLEAD_CHROME||'/home/hermes/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox']})
 const page=await browser.newPage({viewport:{width:1100,height:850}})
 await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort())
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base)
 await page.getByRole('button',{name:'Atribuir ao time',exact:true}).click()
 await page.getByRole('button',{name:'Atribuir lead como novo',exact:true}).click()
 await page.getByRole('button',{name:/Buyer/}).click()
 const start=Date.now()
 await page.getByRole('button',{name:'Entregar e descontar 1 crédito',exact:true}).evaluate(el=>{el.click();el.click()})
 await page.getByText('Lead entregue como novo.',{exact:true}).waitFor()
 await page.screenshot({path:resolve(output,'real-sql-delivery.png'),fullPage:true})
 const ledger=(await q('select * from admin_new_lead_assignments'))[0]
 const lead=(await q('select * from leads where id=$1',[ledger.lead_id]))[0]
 const source=(await q('select * from leads where id=$1',[uuid(41)]))[0]
 check('UI and real API/SQL complete a single delivery',postCount===1&&ledger.buyer_id===uuid(2))
 check('recipient received date is this delivery, not the original capture',lead.created_at.getTime()>=start&&lead.created_at.getTime()===lead.assigned_at.getTime()&&source.created_at.getFullYear()===2019)
 check('previous owner credit remains consumed and recipient pays exactly one',(await q('select total_used from credits where id=$1',[uuid(51)]))[0].total_used===3&&(await q('select total_used from credits where id=$1',[uuid(52)]))[0].total_used===3)
 check('original history is archived, not deleted, and fresh lead has no copied private notes',source.archived===true&&source.redelivered_to_lead_id===lead.id&&source.observation==='private notes'&&lead.observation===null&&(await q('select count(*)::int n from follow_ups where lead_id=$1',[lead.id]))[0].n===0)
 check('current delivery has its immutable real receipt',(await q('select count(*)::int n from lead_delivery_receipts where lead_id=$1 and buyer_id=$2 and credit_id=$3',[lead.id,uuid(2),uuid(52)]))[0].n===1)
 check('new lead starts at recipient first stage',(await q('select stage_id from pipeline_leads where lead_id=$1',[lead.id]))[0].stage_id===uuid(32))
 check('POST sends no external notifications',(await q("select count(*)::int n from admin_new_lead_effects where state='pending'"))[0].n===3)
 const transports=[]
 const ports={rpc,canNotify:async()=>true,notify:async effect=>{transports.push(['notification',effect.lead_id])},enroll:async effect=>{transports.push(['enrollment',effect.lead_id])},automate:async effect=>{transports.push(['automation',effect.lead_id])}}
 await drainAdminNewLeadAssignmentEffects(ports);await drainAdminNewLeadAssignmentEffects(ports)
 check('real outbox drains once to synthetic transports, never repeats',transports.length===3&&transports.every(([,id])=>id===lead.id))
 const replay=await handler.POST(new Request(base+'/api/admin/leads/assign-as-new',{method:'POST',body:JSON.stringify({lead_id:uuid(41),to_buyer_id:uuid(2),request_id:uuid(99)})}))
 const replayBody=await replay.json()
 check('new request ID for the same delivery does not debit again',replay.status===200&&replayBody.replayed&&replayBody.lead_id===lead.id&&(await q('select total_used from credits where id=$1',[uuid(52)]))[0].total_used===3)
 check('confirmed effect readback removes notification pending state',replayBody.notifications_pending===false)
 await page.getByRole('button',{name:'Concluir',exact:true}).click()
 check('UI finishes without browser exceptions',await page.evaluate(()=>window.completed)===true&&errors.length===0)
 writeFileSync(resolve(output,'result.json'),JSON.stringify({at:new Date().toISOString(),passed:checks.length,checks,calls,synthetic:true,external_messages:0},null,2))
} finally {if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await db.close()}
