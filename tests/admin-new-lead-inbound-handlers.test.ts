/* Real handlers + Supabase serialization + real migration; all transports fake. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {ModuleKind,ScriptTarget,transpileModule} from 'typescript'
import {createClient} from '@supabase/supabase-js'
import * as content from '../src/lib/wa-message-content'
import * as routing from '../src/lib/wa-conversation-routing'
import {fixture,uuid} from './admin-new-lead-assignment-fixture'

for(const channel of ['sms','wa']) for(const body of ['STOP','Please call me']) test(`${channel} real handler SELECT -> assignment -> INSERT: ${body}`,async()=>{
 const {db,q,call}=await fixture();const notifications:any[]=[];let receipt:any;let insertCommitted=false
 try{
  await q('alter table buyers add column wa_bridge_phone text, add column whatsapp text')
  await q('update leads set phone=$1 where id=$2',['+15555550100',uuid(41)])
  const client=createClient('https://fixture.invalid','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any,init:any={})=>{
   const u=new URL(String(input));assert.equal(u.hostname,'fixture.invalid')
   const table=u.pathname.split('/').pop()!,method=init.method||'GET'
   assert.ok(['leads','buyers','sms_messages','whatsapp_messages'].includes(table),`unexpected table ${table}`)
   const ident=(s:string)=>{assert.match(s,/^[a-z_]+$/);return s}
   const args:unknown[]=[],where:string[]=[]
   for(const [key,value] of u.searchParams){
    if(['select','order','limit'].includes(key))continue
    ident(key)
    if(value==='is.null')where.push(`${key} is null`)
    else if(value.startsWith('in.(')){args.push(value.slice(4,-1).split(','));where.push(`${key}=any($${args.length}::text[])`)}
    else {const at=value.indexOf('.'),op=value.slice(0,at);assert.ok(['eq','gt'].includes(op));args.push(value.slice(at+1));where.push(`${key}${op==='eq'?'=':'>'}$${args.length}`)}
   }
   const filter=where.length?' where '+where.join(' and '):''
   if(method==='GET'){
    const cols=(u.searchParams.get('select')||'*').split(',').map(ident).join(',')
    const order=u.searchParams.get('order')?.split('.'),sort=order?` order by ${ident(order[0])} ${order[1]==='desc'?'desc':'asc'}`:''
    const limit=u.searchParams.get('limit');if(limit)assert.match(limit,/^\d+$/)
    const rows=await q(`select ${cols} from ${table}${filter}${sort}${limit?' limit '+limit:''}`,args)
    if(table==='leads'){
     assert.equal(u.searchParams.get('redelivered_to_lead_id'),'is.null')
     assert.equal(rows[0].id,uuid(41));receipt=await call()
    }
    return Response.json(rows)
   }
   const payload=JSON.parse(init.body)
   if(method==='POST'){
    const keys=Object.keys(payload).map(ident)
    await q(`insert into ${table}(${keys.join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')})`,keys.map(k=>payload[k]))
    insertCommitted=true
    // No handler notification can run before the required INSERT resolves.
    assert.equal(notifications.length,0)
    return new Response(null,{status:201})
   }
   assert.equal(method,'PATCH')
   const sets=Object.entries(payload).map(([k,v])=>{args.push(v);return `${ident(k)}=$${args.length}`})
   await q(`update ${table} set ${sets.join(',')}${filter}`,args)
   return new Response(null,{status:204})
  }}})
  const notify=async(...args:any[])=>{assert.ok(insertCommitted);notifications.push(args)}
  const deps:Record<string,any>={
   'next/server':{NextResponse:{json:Response.json}},'@/lib/supabase/admin':{createAdminClient:()=>client},
   '@/lib/twilio':{validateTwilioSignature:()=>true,isOptOut:(s:string)=>s==='STOP'},
   '@/lib/notifications':{notifyGroupSmsReply:notify,notifySmsReplyToOwner:notify},
   '@/lib/push-notify':{pushToBuyer:notify},'@/lib/buyer-locale':{localeDoBuyer:async()=> 'en',trad:()=> (_pt:string,en:string)=>en},
   '@/lib/wa-message-content':content,'@/lib/wa-conversation-routing':routing,
  }
  const mod:any={exports:{}}
  const route=channel==='sms'?'twilio-sms':'wa-bridge'
  new Function('require','module','exports','process',transpileModule(readFileSync(`src/app/api/webhook/${route}/route.ts`,'utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)((name:string)=>{assert.ok(name in deps,`unexpected import ${name}`);return deps[name]},mod,mod.exports,{env:{WA_BRIDGE_KEY:'synthetic-only'}})
  const request=channel==='sms'
   ? new Request('https://fixture.invalid/api/webhook/twilio-sms',{method:'POST',headers:{host:'fixture.invalid'},body:new URLSearchParams({From:'+15555550100',To:'+15555550199',Body:body,MessageSid:'synthetic-stale-sms'})})
   : new Request('https://fixture.invalid/api/webhook/wa-bridge',{method:'POST',headers:{apikey:'synthetic-only','content-type':'application/json'},body:JSON.stringify({wa_message_id:'synthetic-stale-wa',from:'15555550100',to:'15555550199',body,type:'chat',bridge_owner_buyer_id:uuid(1)})})
  const response=await mod.exports.POST(request);assert.equal(response.status,200)
  assert.equal((await q('select reason from ai_sequence_suppressions where lead_id=$1',[receipt.lead_id]))[0].reason,body==='STOP'?'optout':'replied')
  assert.equal((await q('select sms_opted_out from leads where id=$1',[receipt.lead_id]))[0].sms_opted_out,body==='STOP')
  const table=channel==='sms'?'sms_messages':'whatsapp_messages'
  const messages=await q(`select * from ${table}`)
  assert.equal(messages.length,1);assert.equal(messages[0].lead_id,uuid(41));assert.equal(messages[0].body,body)
  if(channel==='wa')assert.equal(messages[0].buyer_id,uuid(1))
  assert.ok(notifications.every(args=>args[0]!==uuid(2)),'new owner never receives original private text')
  assert.equal((await q("select claim_admin_new_lead_effect('enrollment') e"))[0].e,null)
 }finally{await db.close()}
})

for(const channel of ['sms','wa'])test(`${channel}: failed required inbound persistence is not acknowledged or notified`,async()=>{
 const events:string[]=[]
 const client=createClient('https://fixture.invalid','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input:any,init:any={})=>{
  const u=new URL(String(input)),table=u.pathname.split('/').pop();assert.equal(u.hostname,'fixture.invalid')
  if(init.method==='POST') {events.push('failed-insert');return Response.json({code:'55P03',message:'synthetic lock timeout'},{status:503})}
  if(table==='leads')return Response.json([{id:uuid(41),name:'Fixture',phone:'+15555550100',assigned_to:uuid(1),assigned_to_member:null,created_at:'2020-01-01',assigned_at:'2020-01-01'}])
  if(table==='buyers')return Response.json([])
  return Response.json([])
 }}})
 const deps:Record<string,any>={'next/server':{NextResponse:{json:Response.json}},'@/lib/supabase/admin':{createAdminClient:()=>client},'@/lib/twilio':{validateTwilioSignature:()=>true,isOptOut:()=>false},'@/lib/notifications':{notifyGroupSmsReply:()=>events.push('notify'),notifySmsReplyToOwner:()=>events.push('notify')},'@/lib/push-notify':{pushToBuyer:()=>events.push('notify')},'@/lib/buyer-locale':{},'@/lib/wa-message-content':content,'@/lib/wa-conversation-routing':routing}
 const mod:any={exports:{}}
 new Function('require','module','exports','process',transpileModule(readFileSync(`src/app/api/webhook/${channel==='sms'?'twilio-sms':'wa-bridge'}/route.ts`,'utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)((name:string)=>{assert.ok(name in deps);return deps[name]},mod,mod.exports,{env:{WA_BRIDGE_KEY:'synthetic-only'}})
 const body=channel==='sms'?new URLSearchParams({From:'+15555550100',To:'+15555550199',Body:'Please call me',MessageSid:'synthetic-retry'}):JSON.stringify({wa_message_id:'synthetic-retry',from:'15555550100',to:'15555550199',body:'Please call me',type:'chat',bridge_owner_buyer_id:uuid(1)})
 const response=await mod.exports.POST(new Request('https://fixture.invalid',{method:'POST',headers:{host:'fixture.invalid',apikey:'synthetic-only'},body}))
 assert.equal(response.status,channel==='sms'?503:500);assert.deepEqual(events,['failed-insert'])
})
