import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ModuleKind, transpileModule } from 'typescript'
test('real automation target finder excludes silent reply movements for both stage triggers',async()=>{
 for(const trigger_type of ['stage_entered','stage_stale']) {
  const calls: unknown[][]=[]
  const db={from(table:string){
   const methods:Record<string,unknown>={}
   for(const key of ['select','eq','in','gte','lte','is'])methods[key]=(...args:unknown[])=>{calls.push([table,key,...args]);return methods}
   methods.then=(resolve:(value:unknown)=>void)=>resolve({data:table==='pipelines'?[{id:'pipeline'}]:calls.some(c=>c[0]==='pipeline_leads'&&c[1]==='is'&&c[2]==='sequence_reply_moved_at'&&c[3]===null)?[]:[{id:'card',lead_id:'lead'}]})
   return methods
  }}
  const source=readFileSync(new URL('../src/lib/automation-engine.ts',import.meta.url),'utf8')+'\nexport {findTargets}'
  const code=transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS}}).outputText
  const loaded={exports:{} as {findTargets:(config:unknown)=>Promise<unknown[]>}}
  new Function('require','module','exports',code)((name:string)=>name==='@/lib/supabase/admin'?{createAdminClient:()=>db}:{},loaded,loaded.exports)
  assert.deepEqual(await loaded.exports.findTargets({buyer_id:'buyer',trigger_type,created_at:'2000-01-01',trigger_config:{stage_id:'stage'}}),[])
  assert.ok(calls.some(c=>c[0]==='pipeline_leads'&&c[1]==='is'&&c[2]==='sequence_reply_moved_at'&&c[3]===null))
 }
})
