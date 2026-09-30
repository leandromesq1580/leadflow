import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sequenceAPI } from '../src/lib/sequence-api'
import { defaultAIConfig } from '../src/lib/ai-sequence-config'
import { AISequenceGenerationError } from '../src/lib/ai-sequence-copy'
const id='00000000-0000-4000-8000-000000000001'
const request=(extra:Record<string,unknown>={})=>new Request('http://local/api/sequences/preview',{method:'POST',body:JSON.stringify({ai_config:defaultAIConfig,locale:'pt',...extra})})
function fixture(generate:NonNullable<Parameters<typeof sequenceAPI>[2]>,session:{id:string;isAdmin:boolean}|null={id,isAdmin:true}){
 let dbCalls=0
 const db=new Proxy({}, {get(){dbCalls++;throw Error('No database access permitted')}})
 return {api:sequenceAPI(db as never,async()=>session,generate),dbCalls:()=>dbCalls}
}
test('admin generates six serial synthetic samples with only the last three generated choices',async()=>{
 const histories:string[][]=[]
 let active=0
 const f=fixture(async(config,lead,recent)=>{
  assert.equal(active++,0)
  assert.deepEqual(config,defaultAIConfig)
  assert.deepEqual(lead,{lead_language:'pt'})
  histories.push([...recent])
  const n=histories.length
  await new Promise(resolve=>setTimeout(resolve,1))
  active--
  return {body:`Synthetic ${n}`,choice:`choice-${n}`}
 })
 const response=await f.api('preview',request({sample_count:6,recent:['CLIENT PRIVATE HISTORY'],recentChoices:['PRIVATE'],lead_id:'PRIVATE',lead:{name:'PRIVATE'}}))
 assert.equal(response.status,200)
 assert.deepEqual(await response.json(),{samples:Array.from({length:6},(_,i)=>({body:`Synthetic ${i+1}`,choice:`choice-${i+1}`})),sent:false})
 assert.deepEqual(histories,[[],['choice-1'],['choice-1','choice-2'],['choice-1','choice-2','choice-3'],['choice-2','choice-3','choice-4'],['choice-3','choice-4','choice-5']])
 assert.equal(f.dbCalls(),0)
})
test('invalid counts and non-admin series are rejected before generation or DB access',async()=>{
 for(const sample_count of [0,-1,7,1.5,'2',null,true,{},[]]){
  let generated=0
  const f=fixture(async()=>{generated++;return {body:'Never',choice:'never'}})
  assert.equal((await f.api('preview',request({sample_count}))).status,400,JSON.stringify(sample_count))
  assert.equal(generated,0);assert.equal(f.dbCalls(),0)
 }
 for(const isAdmin of [false,'true',1]){
  let generated=0
  const f=fixture(async()=>{generated++;return {body:'Never',choice:'never'}},{id,isAdmin:isAdmin as boolean})
  assert.equal((await f.api('preview',request({sample_count:2}))).status,403)
  assert.equal(generated,0);assert.equal(f.dbCalls(),0)
 }
})
test('session and buyer ownership remain authoritative',async()=>{
 for(const [session,extra,status] of [[null,{},401],[{id,isAdmin:true},{buyer_id:'other'},403]] as const){
  let generated=0
  const f=fixture(async()=>{generated++;return {body:'Never',choice:'never'}},session)
  assert.equal((await f.api('preview',request({sample_count:6,...extra}))).status,status)
  assert.equal(generated,0);assert.equal(f.dbCalls(),0)
 }
 const f=fixture(async()=>{throw Error('Never')})
 assert.equal((await f.api('preview',new Request('http://local/api/sequences/preview?buyer_id=other',{method:'POST',body:'{}'}))).status,403)
 assert.equal(f.dbCalls(),0)
})
test('omitted count and explicit one preserve the single response for ordinary buyers',async()=>{
 for(const sample_count of [undefined,1]){
  let generated=0
  const f=fixture(async(_config,lead,recent)=>{generated++;assert.deepEqual(recent,[]);assert.deepEqual(lead,{lead_language:'pt'});return {body:'Single',choice:'one'}},{id,isAdmin:false})
  assert.deepEqual(await (await f.api('preview',request({sample_count}))).json(),{body:'Single',choice:'one',sent:false})
  assert.equal(generated,1);assert.equal(f.dbCalls(),0)
 }
})
test('later failures return fixed safe errors without partial samples or provider body',async(t)=>{
 const logs:unknown[]=[]
 t.mock.method(console,'error',(...args:unknown[])=>{logs.push(args)})
 for(const error of [new Error('PRIVATE_PROVIDER_BODY'),new AISequenceGenerationError('AI_INTERNAL_ERROR')]){
  let generated=0
  const f=fixture(async()=>{if(++generated===3)throw error;return {body:'PARTIAL_PRIVATE',choice:'choice'}})
  const response=await f.api('preview',request({sample_count:6}))
  const body=await response.json()
  const expected=new AISequenceGenerationError('AI_INTERNAL_ERROR')
  assert.equal(response.status,expected.status)
  assert.deepEqual(body,{error:expected.message,code:expected.code,sent:false})
  assert.equal(generated,3);assert.equal(f.dbCalls(),0)
 }
 assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_PROVIDER_BODY|PARTIAL_PRIVATE/)
})
test('preview route allows the bounded six sequential provider timeouts',()=>{
 const source=readFileSync(new URL('../src/app/api/sequences/preview/route.ts',import.meta.url),'utf8')
 assert.match(source,/export const maxDuration\s*=\s*180\b/)
})
