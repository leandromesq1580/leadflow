import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
import * as scheduling from '../src/lib/equipe-booking'

function harness({ message = '', queryError = false, ownerError = false } = {}) {
 const calls: any[] = []
 const db = {
  from(table: string) {
   const q: any = { select:()=>q, eq:()=>q, in:()=>q, gte:()=>q,
    single:async()=>({data:ownerError ? null : {id:'regiane'},error:ownerError}),
    lte:async()=>({data:[],error:queryError}) }
   calls.push(table); return q
  },
  rpc:async (name: string,args: any)=> { calls.push({name,args}); return {data:{ok:true,slot:args.p.slot},error:message?{message}:null} }
 }
 const exports: any = {}
 const js = transpileModule(readFileSync('src/app/api/equipe/agendar/route.ts','utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText
 new Function('require','exports',js)((name: string)=>name==='node:crypto'?{createHmac}:name.includes('supabase')?{createAdminClient:()=>db}:scheduling,exports)
 const body = {nome:'Jane Agent',email:'jane@example.test',telefone:'+1 202 555 0123',idioma:'en',fuso:'America/New_York',slot:scheduling.availableSlots(new Date())[10],requestId:'a97687f0-d792-4b27-bd06-1ee41ccf44b9',website:'',tracking:{utm_campaign:'agents'}}
 const request = (overrides = {}, headers = {}) => new Request('https://example.test/api/equipe/agendar',{method:'POST',headers:{origin:'https://example.test','content-type':'application/json',...headers},body:JSON.stringify({...body,...overrides})})
 return {route:exports,calls,body,request}
}
test('API gives field errors before RPC and normalizes national phones through real validation', async () => {
 const {route,calls,request}=harness()
 for (const [field,value] of [['nome',' '],['email','bad'],['telefone','1111111111'],['slot','2000-01-01T12:00:00.000Z']]) {
  const response=await route.POST(request({[field]:value}))
  assert.equal(response.status,400)
  assert.deepEqual(await response.json(),{code:'invalid',field})
 }
 for (const bad of [{requestId:'bad'},{website:'robot'}]) {
  const response=await route.POST(request(bad))
  assert.equal(response.status,400)
  assert.deepEqual(await response.json(),{code:'invalid'})
 }
 assert.equal(calls.length,0)
 const before=process.env.SUPABASE_SERVICE_ROLE_KEY
 process.env.SUPABASE_SERVICE_ROLE_KEY='local-test-secret'
 try {
  const response=await route.POST(request({telefone:'(202) 555-0123',country:'US'}))
  assert.equal(response.status,200)
  assert.equal(calls[0].args.p.telefone,'+12025550123')
 } finally {if(before===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=before}
})

test('API rejects invalid/cross-origin/honeypot/oversized before database writes',async()=>{
 const {route,calls,request}=harness()
 for(const bad of [{website:'robot'},{slot:'2026-99-99'},{email:'bad'}]) assert.equal((await route.POST(request(bad))).status,400)
 assert.equal((await route.POST(request({}, {origin:'https://evil.test'}))).status,403)
 assert.equal((await route.POST(request({}, {'content-type':'text/plain'}))).status,415)
 assert.equal((await route.POST(request({nome:'x'.repeat(9000)}))).status,413)
 assert.equal(calls.length,0)
})
test('API available slots fail closed and never expose appointment/contact data',async()=>{
 for(const config of [{queryError:true},{ownerError:true}]) assert.equal((await harness(config).route.GET()).status,503)
 const res=await harness().route.GET(); assert.match(res.headers.get('cache-control'),/no-store/)
 const data=await res.json(); assert.deepEqual(Object.keys(data),['slots']); assert.ok(data.slots.length)
})
test('API maps database conflict/rate/error and reports success only on committed RPC',async()=>{
 const before=process.env.SUPABASE_SERVICE_ROLE_KEY
 process.env.SUPABASE_SERVICE_ROLE_KEY='local-test-secret'
 try {
 for(const [message,status] of [['slot_taken',409],['rate_limited',429],['invalid',400],['RPC missing',503],['',200]] as const){
  const {route,calls,request,body}=harness({message})
  const res=await route.POST(request()); assert.equal(res.status,status)
  assert.equal(calls[0].name,'equipe_book'); assert.equal(calls[0].args.p.telefone,'+12025550123'); assert.equal(calls[0].args.p.tracking.utm_campaign,'agents')
  assert.match(calls[0].args.ip_hash,/^[0-9a-f]{64}$/)
  if(status===200) assert.deepEqual(await res.json(),{ok:true,slot:body.slot})
 }
 } finally { if(before===undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY=before }
})
