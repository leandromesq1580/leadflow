import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transpileModule,ModuleKind,ScriptTarget } from 'typescript'
import { nextSendAt,validateAIConfig,defaultAIConfig } from '../src/lib/ai-sequence-config'
function load(rows:unknown[],matches:unknown[]=[],replyError=false){
 const updates:unknown[]=[];const ai:string[]=[];const rpc:string[]=[]
 const db={rpc:(name:string)=>{rpc.push(name);return Object.assign(Promise.resolve({data:name==='claim_legacy_sequence'?[{id:'old',current_step:0,lease_token:'fixture'}]:name==='begin_sequence_batch'?{allowed:true}:name==='finish_sequence_batch'?true:{id:'new'},error:null}),{abortSignal:async()=>({data:0,error:replyError?{message:'synthetic outbox unavailable'}:null})})},from:(table:string)=>{
  const value=table==='sequence_enrollments'?rows:table==='sequences'?matches:table==='sequence_steps'?[{step_type:'wait',delay_hours:0}]:[]
  const q={select:()=>q,eq:()=>q,lte:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:value[0]}),update:(v:unknown)=>{updates.push(v);return q},insert:()=>{throw Error('Unexpected legacy insert')},then:(resolve:(v:unknown)=>void)=>resolve({data:value,error:null})};return q
 }}
 const exports:Record<string,(...args:string[])=>Promise<unknown>>={}
 const req=(name:string)=>{
  if(name.includes('supabase/admin'))return {createAdminClient:()=>db}
  if(name.includes('ai-sequence-engine'))return {aiEnginePorts:()=>({}),runAIEnrollment:async(id:string)=>{ai.push(id);return true}}
  if(name.includes('ai-sequence-config'))return {nextSendAt,validateAIConfig}
  return {}
 }
 new Function('require','exports',transpileModule(readFileSync('src/lib/sequence-engine.ts','utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(req,exports)
 return {exports,ai,updates,rpc}
}
test('cron and inline dispatch AI separately while legacy finite wait completes',async()=>{
 for(const replyError of [false,true])for(const fn of ['processSequences','processSequencesForLead']){
  const f=load([{id:'ai',mode:'ai_until_reply'},{id:'old',mode:'legacy',current_step:0,next_run_at:new Date(0).toISOString()}],[],replyError)
  await f.exports[fn]('lead')
  assert.deepEqual(f.ai,['ai'])
  assert.deepEqual(f.rpc,[...(fn==='processSequences'?['drain_sequence_reply_moves']:[]),'claim_legacy_sequence','begin_sequence_batch','finish_sequence_batch'])
  assert.equal(f.updates.length,0)
 }
})
test('stage auto-enrollment uses guarded SQL for AI, never legacy reactivation',async()=>{
 const f=load([{id:'previous',status:'stopped'}],[{id:'ai',mode:'ai_until_reply',ai_config:defaultAIConfig}])
 await f.exports.autoEnrollByStage('lead','stage','buyer')
 assert.deepEqual(f.rpc,['enroll_sequence']);assert.equal(f.updates.length,0)
})
