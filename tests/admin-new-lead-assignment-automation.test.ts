import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
test('redelivery automation drain scopes execution to its new lead',async()=>{
 const changed:string[]=[]
 const db={from(table:string){
  const filters:Record<string,unknown>={};let inserting=false
  const chain:Record<string,unknown>={}
  for(const key of ['select','gte','lte','is','in','single','maybeSingle'])chain[key]=()=>chain
  chain.eq=(key:string,value:unknown)=>{filters[key]=value;return chain}
  chain.insert=()=>{inserting=true;return chain}
  chain.update=()=>{if(table==='pipeline_leads') changed.push('updated');return chain}
  chain.then=(resolve:(v:unknown)=>void)=>resolve({error:null,data:
   table==='automations'?[{id:'auto',buyer_id:'buyer',trigger_type:'stage_entered',trigger_config:{stage_id:'stage'},action_type:'move_stage',action_config:{target_stage_id:'next'}}]:
   table==='pipelines'?[{id:'pipeline'}]:table==='pipeline_leads'?[{id:'card1',lead_id:'new'},{id:'card2',lead_id:'other'}]:
   table==='automation_runs'?(inserting?{id:'run'}:null):table==='leads'?{redelivered_to_lead_id:null}:null})
  return chain
 }}
 const loaded={exports:{} as {runAutomations:(buyers:string[],leads:string[])=>Promise<unknown>}}
 new Function('require','module','exports',transpileModule(readFileSync('src/lib/automation-engine.ts','utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)((name:string)=>name==='@/lib/supabase/admin'?{createAdminClient:()=>db}:{},loaded,loaded.exports)
 await loaded.exports.runAutomations(['buyer'],['new'])
 assert.equal(changed.length,1)
})

test('real automation action blocks specifically redelivered origins, not ordinary archives',async()=>{
 for(const redelivered of [true,false]) {
  const writes:unknown[]=[]
  const db={from(table:string){
   const chain:Record<string,unknown>={}
   for(const key of ['select','eq','single'])chain[key]=()=>chain
   chain.update=(body:unknown)=>{writes.push(body);return chain}
   chain.then=(resolve:(value:unknown)=>void)=>resolve({data:table==='leads'?{id:'source',archived:true,redelivered_to_lead_id:redelivered?'clone':null}:null,error:null})
   return chain
  }}
  const source=readFileSync('src/lib/automation-engine.ts','utf8')+'\nexport {executeAction}'
  const loaded={exports:{} as {executeAction:(a:unknown,t:unknown)=>Promise<void>}}
  new Function('require','module','exports',transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)((name:string)=>name==='@/lib/supabase/admin'?{createAdminClient:()=>db}:{},loaded,loaded.exports)
  await loaded.exports.executeAction({action_type:'move_stage',action_config:{target_stage_id:'stage'}},{lead_id:'source',pipeline_lead_id:'card'})
  assert.equal(writes.length,redelivered?0:1)
 }
})
