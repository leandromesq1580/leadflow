import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {transpileModule,ModuleKind,ScriptTarget} from 'typescript'
function load(path:string,req:(name:string)=>unknown,env:Record<string,string>={}) {
 const exports:Record<string,(...args:unknown[])=>Promise<unknown>>={}
 new Function('require','exports','process','fetch',transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText)(req,exports,{env},async()=>Response.json({fixture:true}))
 return exports
}
test('run-all rejects spoofed cron user-agent without credentials',async(t)=>{
 t.mock.method(console,'log',()=>{})
 const route=load('src/app/api/cron/run-all/route.ts',name=>name==='next/server'?{NextResponse:Response}:name.includes('sequence-engine')?{processSequences:async()=>({})}:name.includes('automation-engine')?{runAutomations:async()=>({})}:name.includes('supabase/admin')?{createAdminClient:()=>({})}:{importarPortaisPendentes:async()=>({})},{CRON_SECRET:'fixture'})
 const request=Object.assign(new Request('http://local/api/cron/run-all',{headers:{'user-agent':'vercel-cron/1.0'}}),{nextUrl:new URL('http://local/api/cron/run-all')})
 assert.equal((await route.GET(request) as Response).status,401)
})
test('AI scheduler selects due mode before limit; default direct callers retain all modes',async()=>{
 for(const mode of ['ai_until_reply','legacy',undefined]) {
  const filters:unknown[][]=[];let limited=false
  const q={select:()=>q,eq:(...args:unknown[])=>{assert.equal(limited,false);filters.push(args);return q},lte:(...args:unknown[])=>{filters.push(args);return q},order:()=>q,limit:()=>{limited=true;return q},then:(resolve:(v:unknown)=>void)=>resolve({data:[]})}
  const e=load('src/lib/sequence-engine.ts',name=>name.includes('supabase/admin')?{createAdminClient:()=>({from:()=>q})}:{})
  await e.processSequences(mode?{mode}:undefined)
  assert.ok(filters.some(([k,v])=>k==='status'&&v==='active'))
  assert.ok(filters.some(([k])=>k==='next_run_at'))
  assert.deepEqual(filters.filter(([k])=>k==='mode'),mode?[['mode',mode]]:[])
  assert.equal(limited,true)
 }
})
test('dedicated minute cron requires configured Bearer secret, ignores user-agent and never runs legacy',async()=>{
 const path='src/app/api/cron/ai-sequences/route.ts'
 assert.ok(existsSync(path),'dedicated AI cron exists')
 for(const [secret,header,status] of [['','',401],['fixture','',401],['fixture','Bearer wrong',401],['fixture','fixture',401],['fixture','Bearer fixture',200]] as const) {
  const calls:unknown[]=[]
  const route=load(path,name=>name.includes('sequence-engine')?{processSequences:async(options:unknown)=>{calls.push(options);return {processed:0,failed:0}}}:name==='next/server'?{NextResponse:Response}:{},{CRON_SECRET:secret})
  const response=await route.GET(new Request('http://local/api/cron/ai-sequences?secret=fixture',{headers:{authorization:header,'user-agent':'vercel-cron/1.0'}})) as Response
  assert.equal(response.status,status);assert.deepEqual(calls,status===200?[{mode:'ai_until_reply'}]:[])
 }
 const crons=JSON.parse(readFileSync('vercel.json','utf8')).crons
 assert.equal(crons.find((c:{path:string})=>c.path==='/api/cron/ai-sequences').schedule,'* * * * *')
 assert.equal(crons.find((c:{path:string})=>c.path==='/api/poll-leads').schedule,'*/2 * * * *')
 assert.equal(crons.find((c:{path:string})=>c.path==='/api/cron/run-all').schedule,'*/5 * * * *')
 assert.match(readFileSync('src/app/api/cron/run-all/route.ts','utf8'),/processSequences\(\{\s*mode:\s*'legacy'\s*\}\)/)
})
