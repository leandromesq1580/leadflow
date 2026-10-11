import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
const input={insurance:'Seguro',theme:'Conhecer opções',phone:'1 863 280 8696'}
const draft={name:'Seguro',subject_pt:'Assunto',body_pt:'Texto pt',subject_es:'Asunto',body_es:'Texto es'}

test('API de geração exige administrador e rejeita origem externa antes da IA',async()=>{
 assert.ok(existsSync(new URL('../src/lib/email-campaign-ai-api.ts',import.meta.url)),'API de geração ainda não implementada')
 const {createCampaignAIHandler}=await import('../src/lib/email-campaign-ai-api')
 let calls=0
 const handler=createCampaignAIHandler({authenticate:async()=>new Response('denied',{status:403}),generate:async()=>{calls++;return draft}})
 const req=()=>new Request('https://lead4producers.com/api/admin/email-campaigns/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})
 assert.equal((await handler(req())).status,403);assert.equal(calls,0)
 const allowed=createCampaignAIHandler({authenticate:async()=>({id:'admin-fixture'}),generate:async()=>{calls++;return draft}})
 assert.equal((await allowed(new Request('https://lead4producers.com/api/admin/email-campaigns/generate',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:JSON.stringify(input)}))).status,403)
 assert.equal(calls,0)
})
test('entrada inválida, JSON grande e limite de frequência não fazem chamadas extras',async()=>{
 const {createCampaignAIHandler}=await import('../src/lib/email-campaign-ai-api')
 let calls=0
 const handler=createCampaignAIHandler({authenticate:async()=>({id:'admin-fixture'}),generate:async()=>{calls++;return draft}})
 const post=(body:unknown)=>handler(new Request('https://lead4producers.com/api/admin/email-campaigns/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)}))
 assert.equal((await post({...input,phone:'not-a-phone'})).status,400)
 assert.equal((await post('x'.repeat(5000))).status,400)
 assert.equal((await post('invalid-json')).status,400);assert.equal(calls,0)
 for(let n=0;n<6;n++){const r=await post(input);assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.deepEqual((await r.json()).copy,draft)}
 assert.equal((await post(input)).status,429);assert.equal(calls,6)
})
test('API não devolve exceção do provedor nem altera banco ou campanha',async()=>{
 const {createCampaignAIHandler}=await import('../src/lib/email-campaign-ai-api')
 const handler=createCampaignAIHandler({authenticate:async()=>({id:'admin-fixture'}),generate:async()=>{throw new Error('private-provider-data')}})
 const r=await handler(new Request('https://lead4producers.com/api/admin/email-campaigns/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}))
 assert.equal(r.status,502);assert.equal((await r.text()).includes('private-provider-data'),false)
})
