import test from 'node:test'
import assert from 'node:assert/strict'
import { createCampaignCron, createCampaignWebhook, createCampaignUnsubscribe } from '../src/lib/email-campaign-public'
const id='00000000-0000-0000-0000-000000000020'
test('cron authentication does not trust user agent or URL query; no secret means no worker',async()=>{
 let calls=0;const runtime=()=>{calls++;throw new Error('must not initialize')}
 const handler=createCampaignCron({secret:()=> 'synthetic-only',runtime})
 assert.equal((await handler(new Request('https://example.invalid/api/cron/email-campaigns?secret=synthetic-only',{headers:{'User-Agent':'vercel-cron/1.0'}}))).status,401)
 assert.equal(calls,0)
 const missing=createCampaignCron({secret:()=>'',runtime});assert.equal((await missing(new Request('https://example.invalid'))).status,503)
})
test('unsigned and invalid webhook cannot access database; SDK verifies raw payload before parsing',async()=>{
 let calls=0
 const handler=createCampaignWebhook({secret:()=> 'synthetic-secret',verify:()=>{throw new Error('bad signature')},db:()=>{calls++;throw new Error('must not initialize')}})
 assert.equal((await handler(new Request('https://example.invalid',{method:'POST',body:'{}'}))).status,401)
 assert.equal(calls,0)
})
test('verified provider events from other modules are ignored; tagged campaign events reach SQL',async()=>{
 let calls=0;const db=()=>({rpc:async()=>{calls++;return {data:true,error:null}}})
 const event={type:'email.delivered',created_at:new Date().toISOString(),data:{email_id:'synthetic-provider',tags:{module:'manual_email',recipient:id}}}
 const handler=createCampaignWebhook({secret:()=> 'synthetic-secret',verify:()=>event,db})
 const request=()=>new Request('https://example.invalid',{method:'POST',headers:{'svix-id':'synthetic-event'},body:'{}'})
 assert.equal((await handler(request())).status,200);assert.equal(calls,0)
 event.data.tags.module='admin_insurance_campaigns';assert.equal((await handler(request())).status,200);assert.equal(calls,1)
})

test('unsubscribe GET is a confirmation only; POST permanently suppresses by opaque token without revealing address',async()=>{
 const calls:[string,Record<string,unknown>][]=[];const handler=createCampaignUnsubscribe({db:()=>({rpc:async(n,a)=>{calls.push([n,a]);return {data:true,error:null}}})})
 const get=await handler(new Request('https://example.invalid',{method:'GET'}),id);assert.equal(get.status,200);assert.equal(calls.length,0)
 const text=await get.text();assert.match(text,/Confirmar/);assert.doesNotMatch(text,/@/)
 const post=await handler(new Request('https://example.invalid',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'}),id)
 assert.equal(post.status,200);assert.equal(calls.length,1);assert.equal(calls[0][0],'ec_unsubscribe');assert.equal(calls[0][1].p_token,id)
 assert.equal((await handler(new Request('https://example.invalid'), 'bad')).status,404)
})
