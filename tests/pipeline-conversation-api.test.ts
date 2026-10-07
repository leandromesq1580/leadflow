/* eslint-disable @typescript-eslint/no-explicit-any -- offline database boundary */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const buyer='11111111-1111-4111-8111-111111111111', pipeline='22222222-2222-4222-8222-222222222222', auth='33333333-3333-4333-8333-333333333333'
const session={id:buyer,authUserId:auth,isAdmin:false}
const req=(q=`pipeline_id=${pipeline}`)=>new Request('http://fixture.invalid/api/pipeline/conversation-order?'+q)
async function api() {
 const m=await import('../src/lib/pipeline-conversation-api').catch(()=>({} as any))
 assert.equal(typeof m.conversationOrderAPI,'function','authenticated conversation metadata API must exist')
 return m.conversationOrderAPI
}
function fixture(overrides:Record<string,any[]>={}, fail='', beforeRead=(table:string,tables:Record<string,any[]>)=>{void table;void tables}) {
 const tables:Record<string,any[]>={pipelines:[{id:pipeline,buyer_id:buyer}],pipeline_leads:[{id:'p1',pipeline_id:pipeline,lead:{id:'l1',assigned_to:buyer,assigned_to_member:null}}],leads:[{id:'l1',assigned_to:buyer,assigned_to_member:null,whatsapp_messages:[{sent_at:'2026-09-30T12:00:00Z'}]}],...overrides}
 // These tests model genuine messages. Include content now read by the shared
 // classifier; the separate R1 transport tests exercise empty/own-echo rows.
 for(const lead of tables.leads)if(Array.isArray(lead.whatsapp_messages))lead.whatsapp_messages=lead.whatsapp_messages.map((m:any,i:number)=>({id:'message-'+i,direction:'in',body:'fixture reply',media_type:null,media_url:null,wa_message_id:'false_fixture',...m}))
 const calls:any[]=[]
 const db={from(table:string){const ops:any[]=[];calls.push({table,ops});const chain:any=new Proxy({}, {get:(_,key)=>key==='then'?(resolve:any)=>{
  beforeRead(table,tables)
  let rows=structuredClone(tables[table]||[])
  for(const [op,col,val] of ops){
   if(op==='eq' && !col.includes('.'))rows=rows.filter(r=>r[col]===val)
   if(op==='in' && !col.includes('.'))rows=rows.filter(r=>val.includes(r[col]))
   if(op==='gt')rows=rows.filter(r=>r[col]>val)
   if(op==='order'&&!val?.referencedTable)rows.sort((a,b)=>a[col]<b[col]?-1:1)
  }
  const limit=ops.find(o=>o[0]==='limit'&&!o[2]?.referencedTable)
  if(limit)rows=rows.slice(0,Math.min(limit[1],37)) // server cap below requested
  resolve({data:ops.some(o=>o[0]==='maybeSingle')?rows[0]||null:rows,error:table===fail || (fail===table+':later'&&ops.some(o=>o[0]==='gt'))?{message:'secret'}:null})
 }: (...args:any[])=>{assert.ok(!['insert','update','delete','rpc'].includes(String(key)));ops.push([key,...args]);return chain}});return chain}}
 return {db,calls}
}
test('mixed board omits delegated metadata before querying messages, including later pages',async()=>{
 const make=await api()
 for(const count of [2,80]) {
  const parents=Array.from({length:count},(_,i)=>({id:'p'+String(i).padStart(4,'0'),pipeline_id:pipeline,lead:{id:'l'+i,assigned_to:buyer,assigned_to_member:i===count-1?'m':null}}))
  const f=fixture({pipeline_leads:parents,leads:parents.map(p=>({...p.lead,whatsapp_messages:[]})),team_members:[{id:'m',auth_user_id:'member-auth'}],buyers:[{id:'foreign',auth_user_id:'member-auth'}]})
  const r=await make(f.db,async()=>session)(req());assert.equal(r.status,200)
  const body=await r.json();assert.equal(body.conversations.length,count-1)
  assert.ok(!body.conversations.some((c:any)=>c.lead_id==='l'+(count-1)))
  for(const c of f.calls.filter(c=>c.table==='leads'))assert.ok(!c.ops.find((o:any)=>o[0]==='in'&&o[1]==='id')[2].includes('l'+(count-1)))
 }
})
test('member buyer mapping revoked during metadata read omits only inaccessible metadata',async()=>{
 const make=await api()
 const owner={id:'l1',assigned_to:buyer,assigned_to_member:'m'}
 const f=fixture({pipeline_leads:[{id:'p1',pipeline_id:pipeline,lead:owner}],leads:[{...owner,whatsapp_messages:[]}],team_members:[{id:'m',auth_user_id:'member-auth'}],buyers:[]},'',(table,tables)=>{
  if(table==='leads')tables.buyers=[{id:'foreign',auth_user_id:'member-auth'}]
 })
 const response=await make(f.db,async()=>session)(req())
 assert.equal(response.status,200);assert.deepEqual((await response.json()).conversations,[])
})
test('concurrent lead delegation preserves unrelated authorized dates, not null for revoked metadata',async()=>{
 const make=await api(),lead=(id:string)=>({id,assigned_to:buyer,assigned_to_member:null})
 const f=fixture({pipeline_leads:['l1','l2'].map((id,i)=>({id:'p'+i,pipeline_id:pipeline,lead:lead(id)})),leads:[{...lead('l1'),assigned_to:'foreign',whatsapp_messages:[{sent_at:'2026-09-30'}]},{...lead('l2'),whatsapp_messages:[{sent_at:'2026-09-29'}]}]})
 const r=await make(f.db,async()=>session)(req());assert.equal(r.status,200)
 assert.deepEqual((await r.json()).conversations,[{lead_id:'l2',last_whatsapp_at:'2026-09-29'}])
})
test('database failure during post-metadata ownership recheck is 503, never empty success',async()=>{
 const make=await api(),owner={id:'l1',assigned_to:buyer,assigned_to_member:'m'};let metadataRead=false
 const f=fixture({pipeline_leads:[{id:'p1',pipeline_id:pipeline,lead:owner}],leads:[{...owner,whatsapp_messages:[]}],team_members:[{id:'m',auth_user_id:'member-auth'}],buyers:[]},'',table=>{
  if(table==='leads')metadataRead=true
  if(table==='team_members'&&metadataRead)throw Error('fixture unavailable')
 })
 const r=await make(f.db,async()=>session)(req());assert.equal(r.status,503)
 assert.deepEqual(await r.json(),{error:'Conversations unavailable'})
})
test('auth before scope reads; identity comes only from validated session',async()=>{
 const make=await api();const f=fixture()
 assert.equal((await make(f.db,async()=>null)(req())).status,401);assert.equal(f.calls.length,0)
 const r=await make(f.db,async()=>session)(req(''))
 assert.deepEqual(await r.json(),{auth_user_id:auth});assert.match(r.headers.get('cache-control')!,/private, no-store/)
})
test('strict board owner; admin/agency visibility cannot disclose conversation dates; malformed and pseudo rejected',async()=>{
 const make=await api()
 for(const s of [{...session,id:'other'}, {...session,id:'other',isAdmin:true}]) {
  const f=fixture();const r=await make(f.db,async()=>s)(req())
  assert.equal(r.status,403);assert.ok(!f.calls.some(c=>c.table==='leads'))
 }
 for(const id of ['bad','pseudo-pipe-'+pipeline]){const f=fixture();assert.equal((await make(f.db,async()=>session)(req('pipeline_id='+id))).status,400);assert.equal(f.calls.length,0)}
})
test('minimal dates and IDs, caller buyer filters embed top1 before order; ignores requested buyer_id',async()=>{
 const make=await api(),f=fixture()
 const r=await make(f.db,async()=>session)(req(`pipeline_id=${pipeline}&buyer_id=foreign`))
 assert.equal(r.status,200)
 assert.deepEqual(await r.json(),{auth_user_id:auth,pipeline_id:pipeline,conversations:[{lead_id:'l1',last_whatsapp_at:'2026-09-30T12:00:00Z'}]})
 assert.ok(!f.calls.some(c=>c.table==='sms_messages'),'SMS never contributes to WhatsApp ordering')
 const c=f.calls.find(c=>c.table==='leads')
 assert.ok(c.ops.some((o:any)=>o[0]==='eq'&&o[1]==='whatsapp_messages.buyer_id'&&o[2]===buyer))
 assert.ok(c.ops.some((o:any)=>o[0]==='in'&&o[1]==='whatsapp_messages.direction'&&JSON.stringify(o[2])==='["in","out"]'))
 assert.ok(c.ops.some((o:any)=>o[0]==='in'&&o[1]==='whatsapp_messages.status'&&JSON.stringify(o[2])==='["sent","delivered","read"]'))
 assert.ok(c.ops.some((o:any)=>o[0]==='limit'&&o[1]===1&&o[2]?.referencedTable==='whatsapp_messages'))
 assert.ok(c.ops.some((o:any)=>o[0]==='select'&&o[1]==='id,assigned_to,assigned_to_member,whatsapp_messages(id,sent_at,direction,body,media_type,media_url,wa_message_id)'))
 assert.ok(c.ops.some((o:any)=>o[0]==='order'&&o[1]==='id'&&o[2]?.referencedTable==='whatsapp_messages'&&o[2].ascending===false))
})
test('current lead owner enforced in batches including assigned members and ownership changes',async()=>{
 const make=await api()
 for(const at of ['parents','metadata']) {
  const f=fixture(at==='parents'?{pipeline_leads:[{id:'p1',pipeline_id:pipeline,lead:{id:'l1',assigned_to:'foreign'}}]}:{leads:[{id:'l1',assigned_to:'foreign',whatsapp_messages:[{sent_at:'secret'}]}]})
  const r=await make(f.db,async()=>session)(req())
  assert.equal(r.status,200);assert.deepEqual((await r.json()).conversations,[])
 }
 const member={id:'m',auth_user_id:'member-auth'}
 const parents=[{id:'p1',pipeline_id:pipeline,lead:{id:'l1',assigned_to:buyer,assigned_to_member:'m'}}]
 const f=fixture({pipeline_leads:parents,team_members:[member],buyers:[{id:'foreign',auth_user_id:'member-auth'}]})
 const delegated=await make(f.db,async()=>session)(req())
 assert.equal(delegated.status,200);assert.deepEqual((await delegated.json()).conversations,[])
 assert.ok(!f.calls.some(c=>c.table==='leads'))
 const fallback=fixture({pipeline_leads:parents,team_members:[member],buyers:[],leads:[{id:'l1',assigned_to:buyer,assigned_to_member:'m',whatsapp_messages:[]}]})
 assert.equal((await make(fallback.db,async()=>session)(req())).status,200)
})
test('paginates parents and metadata without silent server cap; late errors discard partial data',async()=>{
 const make=await api()
 const parents=Array.from({length:205},(_,i)=>({id:'p'+String(i).padStart(4,'0'),pipeline_id:pipeline,lead:{id:'l'+i,assigned_to:buyer,assigned_to_member:null}}))
 const leads=parents.map(p=>({...p.lead,whatsapp_messages:[]}))
 const f=fixture({pipeline_leads:parents,leads});const r=await make(f.db,async()=>session)(req())
 assert.equal(r.status,200);assert.equal((await r.json()).conversations.length,205)
 assert.ok(f.calls.length<40,'batched, not one request per lead')
 for(const fail of ['pipelines','pipeline_leads','leads','pipeline_leads:later','leads:later']) {
  const f=fixture({pipeline_leads:parents,leads},fail),r=await make(f.db,async()=>session)(req())
  assert.equal(r.status,503,fail);assert.ok(!(await r.text()).includes('secret'))
 }
})
test('unknown/missing read results are unavailable, genuine empty thread is null',async()=>{
 const make=await api()
 for(const messages of [[],[{sent_at:null}],[{sent_at:'invalid'}]]) {
  const f=fixture({leads:[{id:'l1',assigned_to:buyer,assigned_to_member:null,whatsapp_messages:messages}]})
  const r=await make(f.db,async()=>session)(req());assert.equal(r.status,200);assert.equal((await r.json()).conversations[0].last_whatsapp_at,null)
 }
 const f=fixture({leads:[]});assert.equal((await make(f.db,async()=>session)(req())).status,503)
})
test('real GET route and callerBuyer authenticate through server getUser, ignoring spoofed identity parameters',async()=>{
 const make=await api()
 const load=(file:string,dependencies:Record<string,any>)=>{
  const exports:any={}
  const js=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  new Function('require','exports',js)((name:string)=>{assert.ok(name in dependencies,name);return dependencies[name]},exports)
  return exports
 }
 for(const user of [null,{id:auth},{id:'foreign-auth'}]) {
  const f=fixture({buyers:[{id:buyer,auth_user_id:auth,is_admin:false}]});let checks=0
  const authModule=load('src/lib/api-auth.ts',{'@/lib/supabase/server':{createServerSupabase:async()=>({auth:{getUser:async()=>{checks++;return {data:{user}}}}})}})
  const route=load('src/app/api/pipeline/conversation-order/route.ts',{'@/lib/supabase/admin':{createAdminClient:()=>f.db},'@/lib/api-auth':authModule,'@/lib/pipeline-conversation-api':{conversationOrderAPI:make}})
  assert.deepEqual(Object.keys(route),['GET'])
  const r=await route.GET(req(`pipeline_id=${pipeline}&auth_user_id=${auth}&buyer_id=${buyer}`))
  assert.equal(r.status,user?.id===auth?200:401);assert.equal(checks,1)
  if(user?.id!==auth)assert.ok(!f.calls.some(c=>c.table==='leads'||c.table==='pipelines'))
 }
 const unavailable=load('src/app/api/pipeline/conversation-order/route.ts',{'@/lib/supabase/admin':{createAdminClient:()=>{throw Error('secret')}},'@/lib/api-auth':{},'@/lib/pipeline-conversation-api':{conversationOrderAPI:make}})
 assert.equal((await unavailable.GET(req())).status,503)
})
test('member/buyer read errors and late page errors fail closed rather than permission fallback',async()=>{
 const make=await api(),member={id:'m',auth_user_id:'member-auth'}
 const parents=[{id:'p1',pipeline_id:pipeline,lead:{id:'l1',assigned_to:buyer,assigned_to_member:'m'}}]
 for(const fail of ['team_members','buyers','team_members:later','buyers:later']){
  const f=fixture({pipeline_leads:parents,team_members:[member],buyers:[{id:buyer,auth_user_id:'member-auth'}]},fail)
  assert.equal((await make(f.db,async()=>session)(req())).status,503,fail)
 }
})
test('actual Supabase serializer emits per-parent nested order/limit, never global message cap',async()=>{
 const make=await api();const urls:URL[]=[]
 const db=createClient('http://fixture.invalid','fixture',{auth:{persistSession:false},global:{fetch:async(url:any)=>{
  const u=new URL(url);urls.push(u);const t=u.pathname.split('/').at(-1)
  const data=t==='pipelines'?{id:pipeline}:t==='pipeline_leads'?(u.searchParams.has('id')?[]:[{id:'p1',lead:{id:'l1',assigned_to:buyer,assigned_to_member:null}}]):t==='leads'?(u.searchParams.has('id')&&u.searchParams.get('id')?.startsWith('gt.')?[]:[{id:'l1',assigned_to:buyer,assigned_to_member:null,whatsapp_messages:[]}]):[]
  // duplicate id filters are legal: keyset plus IN
  const output=t==='leads'&&u.searchParams.getAll('id').some(v=>v.startsWith('gt.'))?[]:data
  return Response.json(output)
 }}})
 assert.equal((await make(db,async()=>session)(req())).status,200)
 const u=urls.find(u=>u.pathname.endsWith('/leads'))!
 assert.equal(u.searchParams.get('whatsapp_messages.limit'),'1')
 assert.equal(u.searchParams.get('whatsapp_messages.order'),'sent_at.desc.nullsfirst,id.desc')
 assert.equal(u.searchParams.get('whatsapp_messages.buyer_id'),'eq.'+buyer)
 assert.equal(u.searchParams.get('whatsapp_messages.status'),'in.(sent,delivered,read)')
 assert.equal(u.searchParams.get('whatsapp_messages.sent_at'),'not.is.null')
})
