import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {transpileModule,ModuleKind,ScriptTarget} from 'typescript'
import * as config from '../src/lib/ai-sequence-config'
import type {aiEnginePorts,AIEnrollment,AIEnginePorts,runAIEnrollment} from '../src/lib/ai-sequence-engine'
function adapter(rate=true){
 const loaded={exports:{} as {aiEnginePorts:typeof aiEnginePorts;runAIEnrollment:typeof runAIEnrollment}}
 const dependencies:Record<string,unknown>={
  './ai-sequence-config':config,'./ai-sequence-copy':{generateSequenceCopy:()=>{throw Error('Not used')}},
  './wa-bridge':{getBridgeForBuyer:async()=>({url:'https://bridge.invalid',key:'fixture',ownerBuyerId:'buyer',phone:'fixture'})},
  './send-guard':{checkSendRate:async()=>({ok:rate})},
 }
 new Function('require','module','exports',transpileModule(readFileSync('src/lib/ai-sequence-engine.ts','utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)((name:string)=>{assert.ok(name in dependencies,name);return dependencies[name]},loaded,loaded.exports)
 return {...loaded.exports.aiEnginePorts({} as never), run:loaded.exports.runAIEnrollment}
}
test('engine transports validated instructions to generation without changing transport body', async()=>{
 const instructions='1. Explique como funciona.\nNão prometa preços ou aprovação. '.repeat(8).trim()
 let received=''; let sent=''
 const ports:AIEnginePorts={now:()=>new Date('2026-09-29T15:00:00Z'),claim:async()=>enrollment,context:async()=>({...ctx,config:{...config.defaultAIConfig,instructions}}),ready:async()=>{},generate:async(c)=>{received=c.instructions ?? '';return {body:'Fixture body',choice:'fixture'}},begin:async()=>true,send:async(_e,_c,body)=>{sent=body;return {id:'fixture',from:'fixture',to:'fixture'}},finish:async()=>{},defer:async()=>{assert.fail('unexpected defer')}}
 assert.equal(await adapter().run('e',ports),true)
 assert.equal(received,instructions);assert.equal(sent,'Fixture body')
})
const enrollment={id:'e',buyer_id:'buyer',lead_id:'lead',sequence_id:'seq',lease_token:'token',current_step:0,recent_choices:[]} as AIEnrollment
const ctx={config:config.defaultAIConfig,lead:{lead_language:'pt'},phone:'14075550100'}
test('real transport adapter retains account bridge, readiness and delivery confirmation contract',async t=>{
 const calls:{url:string;body?:string}[]=[]
 t.mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{calls.push({url,body:String(init.body||'')});return Response.json(url.endsWith('/status')?{ready:true}:{id:'wa-confirmed'})})
 const ports=adapter()
 await ports.ready(enrollment)
 const result=await ports.send(enrollment,ctx,'Quero ajudar com sua proteção. Podemos combinar uma ligação?')
 assert.equal(result.id,'wa-confirmed');assert.equal(calls[1].url,'https://bridge.invalid/send')
 assert.deepEqual(JSON.parse(calls[1].body!),{number:ctx.phone,message:'Quero ajudar com sua proteção. Podemos combinar uma ligação?'})
})
test('rate block never touches bridge; offline and missing send confirmation reject',async t=>{
 let calls=0
 t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({ready:false})})
 await assert.rejects(adapter(false).ready(enrollment));assert.equal(calls,0)
 await assert.rejects(adapter().ready(enrollment));assert.equal(calls,1)
 const ports=adapter()
 t.mock.method(globalThis,'fetch',async()=>Response.json({ready:true}))
 await ports.ready(enrollment)
 await assert.rejects(ports.send(enrollment,ctx,'fixture'),/Missing delivery confirmation/)
 t.mock.method(globalThis,'fetch',async()=>Response.json({},{status:429}))
 await assert.rejects(ports.send(enrollment,ctx,'fixture'),/not confirmed/)
})
