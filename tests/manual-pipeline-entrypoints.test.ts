import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'
const native=createRequire(import.meta.url)
function load(file:string,deps:Record<string,unknown>){
 const m={exports:{} as Record<string, (...args:unknown[])=>Promise<unknown>>}
 new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)((name:string)=>name in deps?deps[name]:native(name),m,m.exports);return m.exports
}
test('client and admin routes share one strict implementation and admin route cannot downgrade',async()=>{
 const calls:unknown[][]=[];const deps={'@/lib/manual-pipeline-api':{manualPipelineRequest:async(...args:unknown[])=>{calls.push(args);return Response.json({})}}}
 const client=load('src/app/api/leads/[id]/pipeline-entry/route.ts',deps);const admin=load('src/app/api/admin/leads/[id]/pipeline-entry/route.ts',deps)
 const req=new Request('http://localhost');const ctx={params:Promise.resolve({id:'fixture'})}
 await client.GET(req,ctx);await client.POST(req,ctx);await admin.POST(req,ctx)
 assert.deepEqual(calls.map(c=>c.slice(1)),[['fixture'],['fixture'],['fixture',true]])
})
test('final PII reads retain member scope against same-owner reassignment races',()=>{
 for(const file of ['src/app/dashboard/leads/[id]/page.tsx','src/app/api/leads/[id]/route.ts']){
  const source=readFileSync(file,'utf8');assert.match(source,/leadQuery\.eq\('assigned_to_member', actor\.memberId\)/)
 }
})
test('reachable desktop/mobile details wire the repair; desktop refuses unauthorized PII before full query',async()=>{
 for(const file of ['src/app/dashboard/leads/[id]/page.tsx','src/app/m/leads/[id]/page.tsx','src/app/dashboard/pipeline/lead-modal.tsx'])assert.match(readFileSync(file,'utf8'),/<AddExistingLeadToPipeline/)
 let fullReads=0;const db={from:()=>{fullReads++;throw Error('PII must not be queried')}}
 const page=load('src/app/dashboard/leads/[id]/page.tsx',{
  '@/lib/supabase/server':{createServerSupabase:async()=>({auth:{getUser:async()=>({data:{user:{id:'auth'}}})}})},
  '@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/pipeline-guard':{atorDaSessao:async()=>({buyerId:'owner'})},'@/lib/lead-detail-access':{leadDetailOwner:async()=>null},
  '@/lib/locale':{getLocale:async()=>'pt'},'@/lib/florida-time':{},'@/lib/utils':{},'@/components/ui/badge':{},'@/components/lead-language-badge':{},'@/components/add-existing-lead-to-pipeline':{},
  'next/link':{},'next/navigation':{redirect:()=>{throw Error('redirect')},notFound:()=>{throw Error('not-found')}},
 }).default
 await assert.rejects(page({params:Promise.resolve({id:'lead'})}),/not-found/);assert.equal(fullReads,0)
})
