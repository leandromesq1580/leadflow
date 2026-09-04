const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
function load(file, mocks = {}) {
  const module = { exports: {} }
  const filename = path.join(__dirname, '..', file)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require: n => n in mocks ? mocks[n] : require(n), fetch, Request, Response, console: { error() {} } }, { filename })
  return module.exports
}
const client = load('src/lib/team-removal-client.ts')
const memberId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
function route(options={}) {
  const calls=[]
  const db={rpc:async(name,args)=>{calls.push({name,args});return options.reply || {data:{ok:true,member_id:memberId,returned_leads:1,archived_leads:1},error:null}}}
  return {...load('src/app/api/team/members/[id]/route.ts',{
    'next/server':{NextResponse:{json:(data,init)=>new Response(JSON.stringify(data),init)}},
    '@/lib/supabase/admin':{createAdminClient:()=>db},
    '@/lib/api-auth':{callerBuyer:async()=> options.anonymous ? null : {id:'session-buyer',isAdmin:false}},
  }),calls}
}
const request=()=>new Request('https://example.com/api/team/members/'+memberId,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({buyer_id:'forged-buyer',auth_user_id:'forged-user'})})
test('anonymous removal is rejected before any mutation',async()=>{
  const r=route({anonymous:true});assert.equal((await r.DELETE(request(),{params:Promise.resolve({id:memberId})})).status,401);assert.equal(r.calls.length,0)
})
test('invalid member ID is rejected before any mutation',async()=>{
  const r=route();assert.equal((await r.DELETE(request(),{params:Promise.resolve({id:'invalid'})})).status,400);assert.equal(r.calls.length,0)
})
test('server takes actor exclusively from authenticated session and uses atomic removal',async()=>{
  const r=route();const res=await r.DELETE(request(),{params:Promise.resolve({id:memberId})})
  assert.equal(res.status,200);assert.equal((await res.json()).success,true)
  assert.equal(r.calls[0].name,'remove_team_member');assert.equal(r.calls[0].args.p_actor_buyer_id,'session-buyer')
  assert.equal(r.calls[0].args.p_member_id,memberId)
  assert.equal(res.headers.get('cache-control'),'private, no-store')
})
test('permission and database errors cannot masquerade as success or leak DB details',async()=>{
  for(const [reply,status,code] of [
    [{data:{ok:false,code:'FORBIDDEN'},error:null},403,'FORBIDDEN'],
    [{data:null,error:{code:'P0001',message:'TEAM_REMOVAL_NO_PIPELINE'}},409,'NO_PIPELINE'],
    [{data:null,error:{code:'P0001',message:'TEAM_REMOVAL_CONFLICT'}},409,'CONFLICT'],
    [{data:null,error:{code:'23503',message:'PRIVATE_DATABASE_DETAIL'}},500,'REMOVE_FAILED'],
  ]) { const r=route({reply});const res=await r.DELETE(request(),{params:Promise.resolve({id:memberId})});assert.equal(res.status,status);assert.equal((await res.json()).code,code) }
})
test('client treats HTTP failures, HTML redirects, and missing success flags as failures',async()=>{
  for(const response of [new Response(JSON.stringify({code:'REMOVE_FAILED'}),{status:500}),new Response('<html>Login</html>',{status:200}),new Response('{}',{status:200})]) {
    await assert.rejects(client.removeTeamMember(memberId,async()=>response),/REMOVE_FAILED/)
  }
  await assert.rejects(client.removeTeamMember(memberId,async()=>new Response('{}',{status:401})),/UNAUTHORIZED/)
  await assert.rejects(client.removeTeamMember(memberId,async()=>{throw Error('Network unavailable')}),/Network/)
})
test('client only reports deletion when API confirms it',async()=>{
  let called
  const data=await client.removeTeamMember(memberId,async(url,options)=>{called={url,options};return new Response(JSON.stringify({success:true,returned_leads:1,archived_leads:1}))})
  assert.equal(called.options.method,'DELETE');assert.equal(data.archived_leads,1)
})
test('every removal error has Portuguese, English and Spanish feedback',()=>{
  for(const code of ['UNAUTHORIZED','FORBIDDEN','NO_PIPELINE','CONFLICT','REMOVE_FAILED','unknown']) {
    const values=['pt','en','es'].map(locale=>client.teamRemovalError(code,locale));assert.equal(new Set(values).size,3);assert.ok(values.every(x=>x.length>20))
  }
})
test('desktop and mobile keep failed removals visible and block repeated clicks',()=>{
  for(const file of ['src/app/dashboard/team/page.tsx','src/app/m/time/page.tsx']) {
    const src=fs.readFileSync(path.join(__dirname,'..',file),'utf8')
    assert.match(src,/await removeTeamMember\(/)
    assert.match(src,/disabled=\{removingId !== null\}/)
    assert.match(src,/teamRemovalError\(/)
    assert.match(src,/role=\{removalFeedback.error \? 'alert' : 'status'\}/)
    assert.match(src,/Leads arquivados continuam arquivados/)
  }
})
