import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { authenticateCampaignAdmin } from '../src/lib/email-campaign-auth'
const authUid='00000000-0000-0000-0000-000000000001',buyerId='00000000-0000-0000-0000-000000000002'
function fixture(admin=true){
 const calls:[string,string][]=[]
 const buyers=()=>({select:(columns:'id,is_admin')=>{assert.equal(columns,'id,is_admin');return {eq:(column:'auth_user_id',uid:string)=>{calls.push([column,uid]);return {single:async()=>({data:uid===authUid?{id:buyerId,is_admin:admin}:null,error:null})}}}}})
 return {calls,deps:{getUser:async()=>({data:{user:{id:authUid}},error:null}),buyers}}
}
test('authentication resolves buyer by auth_user_id and returns buyer id, not Auth uid',async()=>{
 const a=fixture();assert.deepEqual(await authenticateCampaignAdmin(a.deps),{id:buyerId});assert.deepEqual(a.calls,[['auth_user_id',authUid]])
 const source=readFileSync(new URL('../src/app/api/admin/email-campaigns/route.ts',import.meta.url),'utf8')
 assert.match(source,/authenticateCampaignAdmin/);assert.doesNotMatch(source,/\.eq\('id',\s*user\.id\)/)
})
test('signed-in buyer without its own admin flag never inherits parent/team authorization',async()=>{
 const a=fixture(false),r=await authenticateCampaignAdmin(a.deps);assert.ok(r instanceof Response);assert.equal(r.status,403)
 const missing=fixture();const absent=await authenticateCampaignAdmin({...missing.deps,getUser:async()=>({data:{user:null},error:null})});assert.ok(absent instanceof Response);assert.equal(absent.status,401);assert.equal(missing.calls.length,0)
})
