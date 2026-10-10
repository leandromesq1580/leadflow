import test from 'node:test'
import assert from 'node:assert/strict'
import { createCampaignHandlers } from '../src/lib/email-campaign-api'
import { campaignConfiguration } from '../src/lib/email-campaigns'
const actor='00000000-0000-0000-0000-000000000001'
const config=campaignConfiguration({})
const data={name:'Seguro',subject_pt:'Assunto',body_pt:'Conteúdo',subject_es:'Asunto',body_es:'Contenido',filters:{}}
function fixture(auth:{id:string}|Response={id:actor}){
 const calls:[string,Record<string,unknown>][]=[]
 const handlers=createCampaignHandlers({authenticate:async()=>auth,runtime:()=>({config,provider:{verifyDomain:async()=>false,send:async()=>{throw new Error('no real sends')}},db:{rpc:async(n,a)=>{calls.push([n,a]);return {data:n==='ec_list'?{campaigns:[],recipients:[]}:n==='ec_save'?{id:actor}:n==='ec_audience'?{eligible:0}:true,error:null}}}})})
 const post=(body:unknown,origin='https://lead4producers.com')=>handlers.POST(new Request('https://lead4producers.com/api/admin/email-campaigns',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)}))
 return {calls,handlers,post}
}
test('HTTP requires admin before privileged access, blocks foreign origins and unknown actions',async()=>{
 const denied=fixture(new Response('denied',{status:403}));assert.equal((await denied.post({action:'create',campaign:data})).status,403);assert.equal(denied.calls.length,0)
 const a=fixture();assert.equal((await a.post({action:'create',campaign:data},'https://evil.invalid')).status,403)
 assert.equal((await a.post({action:'send_all'})).status,400);assert.equal(a.calls.length,0)
})
test('creating drafts never sends; disabled configuration prevents scheduling',async()=>{
 const a=fixture();assert.equal((await a.post({action:'save',campaign:data})).status,200)
 assert.equal(a.calls[0][0],'ec_save');assert.equal(a.calls[0][1].p_actor,actor)
 assert.equal((await a.post({action:'schedule',id:actor,at:new Date().toISOString(),expected:2,confirm:true})).status,409)
 assert.equal(a.calls.length,1)
})
test('bad filters and missing explicit consent confirmation never reach database',async()=>{
 const a=fixture();assert.equal((await a.post({action:'preview',filters:{buyer_id:'bad'}})).status,400)
 assert.equal((await a.post({action:'permission',filters:{},evidence:'synthetic',confirm:false})).status,400)
 assert.equal(a.calls.length,0)
})
test('admin history endpoint validates identifier and pagination and never returns internal secrets',async()=>{
 const a=fixture();assert.equal((await a.handlers.GET(new Request('https://lead4producers.com/api/admin/email-campaigns?id=bad'))).status,400)
 const r=await a.handlers.GET(new Request('https://lead4producers.com/api/admin/email-campaigns'))
 assert.equal(r.status,200);const body=await r.json();assert.equal(body.configuration.key,undefined);assert.equal(body.configuration.webhookSecret,undefined)
 assert.equal(a.calls[0][0],'ec_list')
})
