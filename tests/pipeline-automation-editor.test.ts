/* eslint-disable @typescript-eslint/no-explicit-any -- Route I/O fixture. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
function route(caller: any, error: unknown = null) {
 const calls: any[]=[]
 const chain: any=new Proxy({},{get:(_,key)=>key==='then'?(ok:any)=>ok({data:[{id:'own',buyer_id:'owner'}],error}):(...args:any[])=>{calls.push([key,...args]);return chain}})
 const m={exports:{} as any}
 const deps:any={'next/server':{NextResponse:Response},'@/lib/supabase/admin':{createAdminClient:()=>({from:(table:string)=>{calls.push(['from',table]);return chain}})},'@/lib/api-auth':{callerBuyer:async()=>caller}}
 const code=ts.transpileModule(readFileSync('src/app/api/automations/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('require','module','exports',code)((n:string)=>{assert.ok(n in deps,n);return deps[n]},m,m.exports)
 return {get:m.exports.GET,calls}
}
test('automation editor list authenticates caller and never honors another buyer, even for admin',async()=>{
 const anonymous=route(null)
 assert.equal((await anonymous.get(new Request('http://fixture.invalid?buyer_id=victim'))).status,401)
 assert.equal(anonymous.calls.length,0)
 for(const isAdmin of [false,true]){
  const f=route({id:'owner',isAdmin})
  const response=await f.get(new Request('http://fixture.invalid?buyer_id=victim'))
  assert.equal(response.status,403);assert.equal(f.calls.length,0)
  const own=await f.get(new Request('http://fixture.invalid'))
  assert.equal(own.status,200);assert.equal((await own.json()).buyer_id,'owner')
  assert.ok(f.calls.some(c=>c[0]==='eq'&&c[1]==='buyer_id'&&c[2]==='owner'))
  assert.match(own.headers.get('Cache-Control')!,/no-store/)
 }
})
test('automation editor read failure is explicit not empty list',async()=>{
 const f=route({id:'owner'}, {message:'private database error'})
 const response=await f.get(new Request('http://fixture.invalid?buyer_id=owner'))
 assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private database error'))
})
