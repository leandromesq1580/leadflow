import test from 'node:test'
import assert from 'node:assert/strict'
import {createCampaignImageHandler,CAMPAIGN_IMAGE_BUCKET,CAMPAIGN_IMAGE_LIMIT} from '../src/lib/email-campaign-images'
const actor='11111111-1111-4111-8111-111111111111'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1gAAAABJRU5ErkJggg==','base64')
function request(bytes:Uint8Array=png,type='image/png',name='photo.png'){const f=new FormData();f.set('image',new File([bytes as BlobPart],name,{type}));return new Request('https://example.org/api/admin/email-campaigns/images',{method:'POST',body:f})}
test('upload é exclusivo do admin, antes de ler arquivo ou acessar storage',async()=>{
 for(const code of [401,403]){let touched=false;const handler=createCampaignImageHandler({authenticate:async()=>Response.json({error:'denied'},{status:code}),upload:async()=>{touched=true;return{url:''}}});const res=await handler(request());assert.equal(res.status,code);assert.equal(touched,false)}
})
test('imagem válida vai só para bucket próprio, nome aleatório, mime confirmado e sem sobrescrever',async()=>{
 let calls=0
 const handler=createCampaignImageHandler({authenticate:async()=>({id:actor}),upload:async input=>{calls++;assert.equal(input.bucket,CAMPAIGN_IMAGE_BUCKET);assert.match(input.path,new RegExp('^'+actor+'/[0-9a-f-]{36}\\.png$'));assert.equal(input.mime,'image/png');assert.deepEqual(input.bytes,png);assert.equal(input.upsert,false);return{url:'https://example.org/storage/v1/object/public/campaign-images/'+input.path}}})
 const res=await handler(request());assert.equal(res.status,200);assert.equal(calls,1);assert.match((await res.json()).url,/campaign-images/)
})
test('arquivo grande, SVG, HTML disfarçado e mime incoerente não chegam ao storage',async()=>{
 let calls=0;const handler=createCampaignImageHandler({authenticate:async()=>({id:actor}),upload:async()=>{calls++;return{url:''}}})
 for(const req of [request(new Uint8Array(CAMPAIGN_IMAGE_LIMIT+1)),request(Buffer.from('<svg onload=alert(1)>'),'image/svg+xml','image.svg'),request(Buffer.from('<script>alert(1)</script>'),'image/png'),request(png,'image/jpeg','photo.jpg'),request(new Uint8Array(0))])assert.equal((await handler(req)).status,400)
 assert.equal(calls,0)
})
test('falha de storage não expõe resposta do provedor ou devolve imagem fantasma',async()=>{
 const handler=createCampaignImageHandler({authenticate:async()=>({id:actor}),upload:async()=>{throw new Error('secret-provider-diagnostic')}})
 const res=await handler(request());assert.equal(res.status,503);const msg=await res.text();assert.doesNotMatch(msg,/secret-provider/);assert.doesNotMatch(msg,/"url"/)
})
