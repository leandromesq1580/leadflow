import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
import * as scheduling from '../src/lib/equipe-booking'
process.env.WA_BRIDGE_URL='http://example.test';process.env.WA_BRIDGE_KEY='test-placeholder'

function load(file: string, deps: Record<string, unknown>) {
 const exports: Record<string, any> = {}
 const js = transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText
 new Function('require','exports',js)((name:string)=>{if(!(name in deps))throw Error(name);return deps[name]},exports)
 return exports
}
test('committed equipe booking dispatches notifications; dispatch failure never changes success',async()=>{
 process.env.SUPABASE_SERVICE_ROLE_KEY='local-test-only'
 let dispatches=0
 const slot=scheduling.availableSlots(new Date())[10]
 const db={rpc:async()=>({data:{ok:true,slot},error:null})}
 const route=load('src/app/api/equipe/agendar/route.ts',{'node:crypto':{createHmac},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/equipe-booking':scheduling,'@/lib/equipe-notifications':{dispatchEquipeNotifications:async()=>{dispatches++;throw Error('offline')}}})
 const request=()=>new Request('https://example.test/api/equipe/agendar',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:JSON.stringify({website:'',nome:'Jane Agent',email:'jane@example.test',telefone:'+12025550123',idioma:'en',fuso:'America/New_York',slot,requestId:'a97687f0-d792-4b27-bd06-1ee41ccf44b9'})})
 assert.deepEqual(await (await route.POST(request())).json(),{ok:true,slot})
 assert.equal(dispatches,1)
})
test('real handler + dispatcher: parallel replay, locales, partial failure and retry',async()=>{
 for(const locale of ['pt','en','es']) {
  const jobs:any[]=[]; const sends:any[]=[]; const wa:any[]=[]; let failEmail=true
  let bookings=0
  const slot=scheduling.availableSlots(new Date())[10]
  const payload={name:'Jane Agent',email:'jane@example.test',phone:'+12025550123',locale,timezone:'America/New_York',slot}
  const db:any={rpc:async(name:string,args:any)=>{
   if(name==='equipe_book') {
    if(!bookings++) for(const channel of ['email','whatsapp']) jobs.push({id:channel,appointment_id:'appointment-id',scheduled_for:slot,lead_id:'lead-id',buyer_id:'regiane-id',channel,payload,status:'pending',attempts:0})
    return {data:{ok:true,slot}}
   }
   const due=jobs.filter(j=>j.status==='pending'); for(const j of due){j.status='sending';j.attempts++}
   return {data:due.map(j=>({...j}))}
  },from:(table:string)=>{
   let update:any;const filters:any={}
   const q:any={select:()=>q,update:(x:any)=>{update=x;return q},eq:(k:string,v:any)=>{filters[k]=v;return q},single:async()=>{if(table==='appointments')return {data:{status:'scheduled',scheduled_at:slot}};assert.deepEqual(filters,{id:'regiane-id',email:scheduling.SALES_EMAIL});return {data:{phone:'+12025550199'}}},then:(resolve:any)=>{if(update){const row=jobs.find(j=>j.id===filters.id && j.status===filters.status && j.attempts===filters.attempts);if(row)Object.assign(row,update)}resolve({error:null})}}
   return q
  }}
  process.env.RESEND_API_KEY='test';process.env.EMAIL_RECRUIT_FROM_EMAIL='Team <team@example.test>'
  class FakeResend { emails = { send: async(p:any,opts:any) => {
   sends.push({p,opts}); return failEmail ? {error:{name:'unavailable'}} : {data:{id:'provider-id'}}
  } } }
  const mod=load('src/lib/equipe-notifications.ts',{'resend':{Resend:FakeResend},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/notifications':{sendEquipeWhatsApp:async(phone:string,message:string)=>{wa.push({phone,message});return true}},'@/lib/equipe-booking':scheduling})
  const route=load('src/app/api/equipe/agendar/route.ts',{'node:crypto':{createHmac},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/equipe-booking':scheduling,'@/lib/equipe-notifications':mod})
  const request=()=>new Request('https://example.test/api/equipe/agendar',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json'},body:JSON.stringify({website:'',nome:payload.name,email:payload.email,telefone:payload.phone,idioma:locale,fuso:payload.timezone,slot,requestId:'a97687f0-d792-4b27-bd06-1ee41ccf44b9'})})
  const results=await Promise.all([route.POST(request()),route.POST(request())])
  for(const r of results)assert.deepEqual(await r.json(),{ok:true,slot})
  assert.equal(sends.length,1);assert.equal(wa.length,1);assert.equal(jobs[0].status,'pending');assert.equal(jobs[1].status,'sent')
  failEmail=false;await route.POST(request());await route.POST(request())
  assert.equal(sends.length,2);assert.deepEqual(sends[0].opts,sends[1].opts);assert.equal(wa.length,1)
  assert.equal(jobs[0].status,'sent');assert.equal(wa[0].phone,'+12025550199')
  assert.match(wa[0].message,/dashboard\/whatsapp\?lead=lead-id/)
  assert.match(sends[1].p.text,/America\/New_York/);assert.doesNotMatch(sends[1].p.text,/https?:|calendar|consult/i)
  assert.match(sends[1].p.subject,locale==='pt'?/recrutamento/:locale==='es'?/reclutamiento/:/Recruitment/)
 }
})

test('WA ambiguity is never queued for automatic replay; email still succeeds',async()=>{
 let saved:any
 const slot=scheduling.availableSlots(new Date())[10]
 const db:any={rpc:async()=>({data:[{id:'wa',appointment_id:'appointment-id',scheduled_for:slot,buyer_id:'owner',lead_id:'lead',channel:'whatsapp',attempts:1,payload:{name:'Jane',email:'a@example.test',phone:'+12025550123',locale:'pt',timezone:'America/New_York',slot}}]}),from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,single:async()=>({data:table==='appointments'?{status:'scheduled',scheduled_at:slot}:{phone:'+12025550199'}}),update:(s:any)=>{saved=s;return q},then:(r:any)=>r({})};return q}}
 const mod=load('src/lib/equipe-notifications.ts',{'resend':{},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/notifications':{sendEquipeWhatsApp:async()=>false},'@/lib/equipe-booking':scheduling})
 await mod.dispatchEquipeNotifications();assert.equal(saved.status,'unknown')
})

test('reminder email has localized reminder purpose and visitor zone',()=>{
 const mod=load('src/lib/equipe-notifications.ts',{'resend':{},'@/lib/supabase/admin':{},'@/lib/notifications':{},'@/lib/equipe-booking':scheduling})
 for(const locale of ['pt','en','es']){
  const p={name:'Jane',email:'a@example.test',phone:'',locale,timezone:'America/New_York',slot:'2026-12-08T15:00:00Z'}
  const result=mod.equipeConfirmation(p,'reminder')
  assert.match(result.subject,locale==='pt'?/Lembrete/:locale==='es'?/Recordatorio/:/Reminder/)
  assert.match(result.text,/America\/New_York/)
 }
})

test('claimed reminders recheck cancellation, reschedule and past immediately before transport',async(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-12-08T14:00:00Z')})
 for(const appointment of [{status:'cancelled',scheduled_at:'2026-12-08T15:00:00Z'},{status:'scheduled',scheduled_at:'2026-12-09T15:00:00Z'},{status:'scheduled',scheduled_at:'2026-12-08T14:00:00Z'},{status:'scheduled',scheduled_at:'2026-12-08T15:00:00Z'}]){
  let sent=0,saved:any
  const job={id:'reminder',appointment_id:'a',scheduled_for:'2026-12-08T15:00:00Z',channel:'email',kind:'reminder',attempts:1,payload:{name:'Jane',email:'a@example.test',phone:'',locale:'en',timezone:'America/New_York',slot:'2026-12-08T15:00:00Z'}}
  const db={rpc:async()=>({data:[job]}),from:()=>{const q:any={select:()=>q,eq:()=>q,single:async()=>({data:appointment}),update:(s:any)=>{saved=s;return q},then:(r:any)=>r({})};return q}}
  class FakeResend {emails={send:async(payload:any,options:any)=>{sent++;assert.match(payload.subject,/Reminder/);assert.match(payload.text,/America\/New_York/);assert.equal(options.idempotencyKey,'equipe-booking-reminder');return {data:{id:'local'}}}}}
  const mod=load('src/lib/equipe-notifications.ts',{'resend':{Resend:FakeResend},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/notifications':{},'@/lib/equipe-booking':scheduling})
  await mod.dispatchEquipeNotifications()
  const valid=appointment.status==='scheduled'&&appointment.scheduled_at===job.scheduled_for
  assert.equal(sent,valid?1:0);assert.equal(saved.status,valid?'sent':'failed')
 }
})

export {load}
