import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
const path = '../src/lib/admin-new-lead-assignment'
const a='00000000-0000-4000-8000-000000000001', b='00000000-0000-4000-8000-000000000002', r='00000000-0000-4000-8000-000000000003'
const success={success:true,lead_id:r,source_lead_id:a,buyer_id:b,assigned_at:'2026-10-15T12:00:00Z',remaining:7,replayed:false}
async function handlers(actor: unknown, calls: [string, unknown][], failRead=false) {
 assert.ok(existsSync('src/lib/admin-new-lead-assignment.ts'),'API behavior implemented')
 const { createAdminNewLeadAssignmentHandlers }=await import(path)
 return createAdminNewLeadAssignmentHandlers({ actor:async()=>actor, rpc:async(name:string,args:unknown)=>{
  calls.push([name,args])
  if(name==='admin_assign_lead_as_new')return {data:success,error:null}
  if(name==='admin_new_lead_assignment_status')return failRead?{data:null,error:{message:'private SQL detail'}}:{data:{...success,notifications_pending:true,replayed:true},error:null}
  return {data:{lead:{id:a,name:'Fixture',language:'pt'},buyers:[],next_cursor:null},error:null}
 }})
}
const post=(body:unknown)=>new Request('https://local.test/api/admin/leads/assign-as-new',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
test('API authorizes admin, validates UUIDs and never leaks internal errors',async()=>{
 for(const actor of [null,{id:a,is_admin:false}]){
  const calls:[string,unknown][]=[];const h=await handlers(actor,calls)
  const res=await h.POST(post({lead_id:a,to_buyer_id:b,request_id:r}));assert.equal(res.status,actor?403:401);assert.deepEqual(calls,[])
 }
 const calls:[string,unknown][]=[];const h=await handlers({id:a,is_admin:true},calls)
 assert.equal((await h.POST(post({lead_id:'bad',to_buyer_id:b,request_id:r}))).status,400)
 assert.equal((await h.GET(new Request(`https://local.test/api?lead_id=${a}&cursor=bad`))).status,400)
 assert.equal(calls.length,0)
})
test('POST performs exact readback before success; ambiguous readback returns private 503',async()=>{
 const calls:[string,unknown][]=[];const h=await handlers({id:a,is_admin:true},calls)
 const res=await h.POST(post({lead_id:a,to_buyer_id:b,request_id:r}))
 assert.equal(res.status,200);assert.match(res.headers.get('Cache-Control')!,/no-store/)
 assert.deepEqual(calls.map(c=>c[0]),['admin_assign_lead_as_new','admin_new_lead_assignment_status'])
 assert.equal((await res.json()).notifications_pending,true)
 const bad=await handlers({id:a,is_admin:true},[],true);const err=await bad.POST(post({lead_id:a,to_buyer_id:b,request_id:r}))
 assert.equal(err.status,503);assert.deepEqual(await err.json(),{error:'Não foi possível confirmar a entrega. Repita o mesmo pedido.',code:'readback_failed'})
})
test('GET literal search passes parameters, pages and status lookup without any write',async()=>{
 const calls:[string,unknown][]=[];const h=await handlers({id:a,is_admin:true},calls)
 const res=await h.GET(new Request(`https://local.test/api?lead_id=${a}&q=${encodeURIComponent('Jane%,()')}&cursor=${b}`))
 assert.equal(res.status,200);assert.deepEqual(calls[0],[ 'admin_new_lead_assignment_options',{p_actor:a,p_source:a,p_query:'Jane%,()',p_cursor:b,p_limit:50}])
 const status=await h.GET(new Request(`https://local.test/api?lead_id=${a}&request_id=${r}`));assert.equal(status.status,200)
 assert.equal(calls[1][0],'admin_new_lead_assignment_status')
})
