import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import ts from 'typescript'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
function fixture(){
 const f={user:{id:id(1)} as {id:string}|null,authError:false,calls:[] as Record<string,unknown>[],rpcError:null as {code:string}|null,invalid:false,readError:false,missing:false,throws:false}
 const card={id:id(9),lead_id:id(2),pipeline_id:id(3),stage_id:id(4)}
 const db={rpc:async(_name:string,args:Record<string,unknown>)=>{if(f.throws)throw Error('private');f.calls.push(args);return {data:f.invalid?{}:{changed:true,silent:true,entry:card},error:f.rpcError}},from:(table:string)=>{
  assert.equal(table,'pipeline_leads');const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:f.missing?null:card,error:f.readError?{}:null})};return query
 }}
 const path='src/lib/manual-pipeline-api.ts';const m={exports:{} as {manualPipelineRequest:(r:Request,id:string,admin?:boolean)=>Promise<Response>}}
 if(existsSync(path))new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((name:string)=>{
  if(name==='@/lib/supabase/server')return {createServerSupabase:async()=>({auth:{getUser:async()=>({data:{user:f.user},error:f.authError?{}:null})}})}
  if(name==='@/lib/supabase/admin')return {createAdminClient:()=>db}
  throw Error('Unexpected import '+name)
 },m,m.exports)
 const call=(body:unknown={pipeline_id:id(3),stage_id:id(4)},admin=false,lead=id(2))=>m.exports.manualPipelineRequest(new Request('http://localhost/api/manual',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),lead,admin)
 return {f,call,available:typeof m.exports.manualPipelineRequest==='function'}
}
test('session API validates strict body, does not trust actor/admin fields, forwards server auth and reads back',async()=>{
 const {f,call,available}=fixture();assert.ok(available,'shared session handler exists')
 f.user=null;assert.equal((await call()).status,401);assert.equal(f.calls.length,0);f.user={id:id(1)}
 for(const body of [null,[],{}, {pipeline_id:id(3),stage_id:id(4),is_admin:true},{pipeline_id:'bad',stage_id:id(4)}])assert.equal((await call(body)).status,400)
 assert.equal(f.calls.length,0)
 const res=await call();assert.equal(res.status,200);assert.equal((await res.json()).success,true)
 assert.deepEqual(f.calls[0],{p_auth:id(1),p_lead:id(2),p_pipeline:id(3),p_stage:id(4),p_admin:false})
 await call(undefined,true);assert.equal(f.calls[1].p_admin,true)
})
test('permission, conflict, migration/network/readback failures stay honest and private',async()=>{
 const {f,call,available}=fixture();assert.ok(available,'shared session handler exists')
 for(const [code,status] of [['42501',403],['23505',409],['55P03',409],['P0002',404],['42883',503]] as const){f.rpcError={code};assert.equal((await call()).status,status)}
 f.rpcError=null;f.invalid=true;assert.equal((await call()).status,503);f.invalid=false
 f.readError=true;assert.equal((await call()).status,503);f.readError=false
 f.missing=true;assert.equal((await call()).status,503);f.missing=false
 f.throws=true;const res=await call();assert.equal(res.status,503);assert.ok(!(await res.text()).includes('private'))
})
