// Offline real-page React/browser fixture; no production services or writes.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdtemp} from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import {build} from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import {createClient} from '@supabase/supabase-js'
import {conversationOrderAPI} from '../src/lib/pipeline-conversation-api.ts'
const root=process.cwd(),output=await mkdtemp(path.join(process.env.TMPDIR,'pipeline-ordering-browser-'))
console.log('Evidence:',output)
await build({entryPoints:['tests/pipeline-ordering-browser-entry.tsx'],bundle:true,outfile:path.join(output,'app.js'),platform:'browser',jsx:'automatic',alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_SUPABASE_URL':'"https://fixture.invalid"','process.env':'{}'},plugins:[{name:'offline-realtime',setup(b){b.onResolve({filter:/use-realtime$/},()=>({path:'realtime',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({resolveDir:root,contents:`import {useEffect} from 'react';export function useRealtime(table,event,filter,callback){useEffect(()=>{if(!filter)return;const fn=()=>callback();window.addEventListener('fixture-'+table+'-'+event,fn);return ()=>window.removeEventListener('fixture-'+table+'-'+event,fn)},[table,event,filter,callback])}`}))}}]})
const css=await postcss([tailwind({base:root})]).process(await readFile('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')})
await writeFile(path.join(output,'app.css'),css.css+(await readFile('src/app/m/m-theme.css','utf8')).replace(/^@import.*$/gm,''))
const server=http.createServer(async(req,res)=>{
 const asset=['/app.js','/app.css'].includes(req.url)
 res.setHeader('Content-Type',asset?(req.url.endsWith('js')?'text/javascript':'text/css'):'text/html; charset=utf-8')
 res.end(asset?await readFile(path.join(output,req.url.slice(1))):'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="font-family:Arial,sans-serif"><div id="root"></div><script src="/app.js"></script></body></html>')
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base=`http://127.0.0.1:${server.address().port}`
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE)
const browser=await chromium.launch({headless:true})
const one='11111111-1111-4111-8111-111111111111',two='22222222-2222-4222-8222-222222222222',authA='33333333-3333-4333-8333-333333333333'
let external=0,writes=[],metadataCalls=0,identity=authA,metaMode='ready',holdMeta=[],holdLeads=[],holdBoard=false,holdPatch=false,pendingPatch=[]
const stages=[{id:'s1',name:'Novos',position:0,color:'#6366f1'},{id:'s2',name:'Em contato',position:1,color:'#06b6d4'},{id:'s3',name:'Proposta',position:2,color:'#f59e0b'}]
const make=(id,name,date,stage='s1')=>({id:'p'+id,stage_id:stage,moved_at:'2026-09-30T12:00:00Z',lead:{id,name,created_at:date,phone:'',state:'FL',email:'',interest:'Seguro de vida',type:'manual',contract_closed:false}})
let cards=[make('a','Ana','2026-09-04'),make('b','Bruno','2026-09-03'),make('c','Carla','2026-09-02'),make('d','Davi','2026-09-01'),make('e','Elisa','2026-09-05','s2')]
let dates={a:'2029-01-01T00:00:00Z',b:null,c:'2026-09-29T12:00:00Z',d:'2026-09-30T12:00:00Z',e:null}
// Synthetic data only. Ana is delegated; her newer private conversation must
// never be read or leak. Bruno has no thread initially. The API remains real.
const buyer='55555555-5555-4555-8555-555555555555'
const dbCalls=[]
const db=createClient('http://fixture.invalid','fixture',{auth:{persistSession:false},global:{fetch:async input=>{
 const u=new URL(input);const table=u.pathname.split('/').at(-1);dbCalls.push({table,query:u.search})
 if(metaMode==='error'&&table==='leads')return Response.json({message:'fixture database unavailable'},{status:500})
 const owner=c=>({id:c.lead.id,assigned_to:buyer,assigned_to_member:c.lead.id==='a'?'member':null})
 let rows=table==='pipelines'?[{id:one,buyer_id:buyer},{id:two,buyer_id:buyer}]:
  table==='pipeline_leads'?cards.map(c=>({id:c.id,pipeline_id:one,lead:owner(c)})):
  table==='team_members'?[{id:'member',auth_user_id:'member-auth'}]:
  table==='buyers'?[{id:'foreign',auth_user_id:'member-auth'}]:
  table==='leads'?cards.map(c=>({...owner(c),whatsapp_messages:dates[c.lead.id]?[{sent_at:dates[c.lead.id]}]:[]})):[]
 for(const [key,value] of u.searchParams){
  if(key.includes('.'))continue
  if(value.startsWith('eq.'))rows=rows.filter(r=>r[key]===value.slice(3))
  if(value.startsWith('gt.'))rows=rows.filter(r=>r[key]>value.slice(3))
  if(value.startsWith('in.(')){const ids=value.slice(4,-1).split(',');rows=rows.filter(r=>ids.includes(r[key]));if(table==='leads'&&key==='id')assert.ok(!ids.includes('a'),'delegated ID excluded BEFORE timestamp read')}
 }
 rows.sort((a,b)=>a.id.localeCompare(b.id))
 return Response.json(table==='pipelines'?rows[0]||null:rows)
}}})
const realAPI=conversationOrderAPI(db,async()=>({id:buyer,authUserId:identity}))
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});page.setDefaultTimeout(5000)
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.context().addCookies([{name:'sb-fixture-auth-token',value:encodeURIComponent(Buffer.from(JSON.stringify({access_token:'x.'+Buffer.from(JSON.stringify({sub:authA})).toString('base64')+'.x'})).toString('base64')),url:base}])
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url())
  if(u.origin!==base){external++;return route.abort()}
  if(!u.pathname.startsWith('/api/'))return route.continue()
  if(req.method()!=='GET'){
   writes.push({path:u.pathname,body:req.postDataJSON()})
   assert.equal(req.method(),'PATCH');assert.match(u.pathname,/^\/api\/pipeline-leads\//)
   if(holdPatch){pendingPatch.push(route);return}
   const id=u.pathname.split('/').at(-1);cards=cards.map(c=>c.id===id?{...c,stage_id:req.postDataJSON().stage_id}:c)
   return route.fulfill({json:{success:true}})
  }
  if(u.pathname==='/api/pipeline/conversation-order'){
   const pid=u.searchParams.get('pipeline_id');if(!pid)return route.fulfill({json:{auth_user_id:identity}})
   metadataCalls++
   if(metaMode==='hold'){holdMeta.push({route,pid});return}
   if(metaMode==='restricted')return route.fulfill({status:403,json:{error:'restricted'}})
   const response=await realAPI(new Request(req.url()))
   return route.fulfill({status:response.status,json:await response.json()})
  }
  if(u.pathname==='/api/settings')return route.fulfill({json:{id:'owner',is_agency:true}})
  if(u.pathname==='/api/m/team-context')return route.fulfill({json:{buyer_id:'owner'}})
  if(u.pathname==='/api/team/members')return route.fulfill({json:{members:[{id:two,name:'Membro fixture',is_active:true}]}})
  if(u.pathname==='/api/team/leads')return route.fulfill({json:{leads:[]}})
  if(u.pathname==='/api/team/member-pipeline')return route.fulfill({json:{pipeline:{id:'pseudo-pipe-'+two,stages},leads:cards,member:{has_own_pipeline:false}}})
  if(u.pathname==='/api/pipelines')return route.fulfill({json:{pipelines:[{id:one,name:'Vendas',is_default:true,stages},{id:two,name:'Renovações',is_default:false,stages}]}})
  if(u.pathname.match(/^\/api\/pipelines\/[^/]+\/leads$/)){if(holdBoard){holdLeads.push(route);return}return route.fulfill({json:{leads:cards}})}
  if(u.pathname==='/api/pipeline/stage-actions')return route.fulfill({json:{pipeline_id:u.searchParams.get('pipeline_id'),stages:stages.map((s,i)=>({id:s.id,sequences:i===0?[{id:'seq',name:'Boas-vindas',enabled:true}]:[],automations:[]}))}})
  if(u.pathname==='/api/whatsapp/unread')return route.fulfill({json:{counts:{}}})
  throw Error('Unexpected API '+u.pathname)
 })
 const names=()=>page.getByText(/^(Ana|Bruno|Carla|Davi)$/).allTextContents()
 const expectNames=async wanted=>{await page.waitForFunction(w=>JSON.stringify([...document.querySelectorAll('p')].map(e=>e.textContent).filter(t=>/^(Ana|Bruno|Carla|Davi)$/.test(t)))===JSON.stringify(w),wanted);assert.deepEqual(await names(),wanted)}
 await page.clock.install()
 await page.clock.pauseAt(new Date(Date.now()+1000)) // No wall-clock drift while awaiting local DB/browser IO.
 await page.goto(base+'/dashboard/pipeline')
 const select=page.getByRole('combobox',{name:'Ordenar'})
 await select.waitFor();assert.equal(await select.inputValue(),'newest')
 await expectNames(['Ana','Bruno','Carla','Davi']);assert.equal(metadataCalls,0,'newest is lazy')
 await page.getByRole('button',{name:'Ações ativas de Novos'}).waitFor()
 assert.equal(await page.getByRole('dialog').count(),0)
 const f=await page.getByRole('button',{name:'Filtros',exact:true}).boundingBox(),s=await select.boundingBox()
 assert.ok(Math.abs(f.y+f.height/2-s.y-s.height/2)<5,'selector inline beside filters')
 await page.screenshot({path:path.join(output,'desktop-default-COLLAPSED.png'),fullPage:true})
 await select.selectOption('conversation');await expectNames(['Davi','Carla','Ana','Bruno'])
 assert.equal(writes.length,0)
 await page.screenshot({path:path.join(output,'desktop-conversations-COLLAPSED.png'),fullPage:true})
 // A new eligible timestamp must reorder without navigation, inside its column.
 for(const route of ['/dashboard/pipeline','/m/pipeline']) {
  dates={a:'2029-01-01T00:00:00Z',b:null,c:'2026-09-29T12:00:00Z',d:'2026-09-30T12:00:00Z',e:null}
  await page.setViewportSize(route.startsWith('/m/')?{width:390,height:844}:{width:1440,height:1000})
  await page.goto(base+route);await expectNames(['Davi','Carla','Ana','Bruno'])
  await page.waitForTimeout(200) // Flush React passive effects before advancing the virtual poll clock.
  const before=metadataCalls
  dates.b='2026-10-02T22:00:00Z'
  const polled=page.waitForResponse(r=>r.url().includes('/api/pipeline/conversation-order?pipeline_id='))
  await page.clock.runFor(5000);await polled
  assert.ok(metadataCalls>before,'fresh metadata requested within 5s')
  await expectNames(['Bruno','Davi','Carla','Ana'])
  await page.screenshot({path:path.join(output,route.startsWith('/m/')?'mobile-refresh.png':'desktop-refresh.png'),fullPage:true})
  console.log('PASS',route,'new message reorders within 5s, same stage, all cards preserved')
 }
 // Background tabs must not poll. Restore visibility via the same browser event.
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}))
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')))
 const hiddenCalls=metadataCalls
 await page.clock.runFor(15000);await page.waitForTimeout(100)
 assert.equal(metadataCalls,hiddenCalls,'background metadata polling is suspended')
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))})
 await expectNames(['Bruno','Davi','Carla','Ana'])
 console.log('PASS background polling suspended and foreground identity revalidated')
 // Genuine DB failures stay errors, not missing conversation dates or silent sort promises.
 await select.selectOption('newest');metaMode='error';await select.selectOption('conversation')
 await expectNames(['Ana','Bruno','Carla','Davi'])
 await page.getByLabel(/Conversas indisponíveis/).waitFor()
 assert.equal(await select.locator('option:checked').textContent(),'Mais novos','visible selector describes actual fallback on error')
 const failures=metadataCalls;await page.clock.runFor(30000);await page.waitForTimeout(100)
 assert.equal(metadataCalls,failures,'errors do not auto-retry forever')
 await page.screenshot({path:path.join(output,'mobile-error-fallback.png'),fullPage:true})
 console.log('PASS error indicator retained, selector truthful, no retry storm')
 metaMode='ready';await select.selectOption('conversation')
 await expectNames(['Bruno','Davi','Carla','Ana'])
 assert.equal(await select.inputValue(),'conversation','selecting conversation from displayed fallback retries')
 dates={a:'2029-01-01T00:00:00Z',b:null,c:null,d:null,e:null}
 await page.clock.runFor(5000);await expectNames(['Ana','Bruno','Carla','Davi'])
 assert.equal(await page.getByLabel(/Conversas indisponíveis|Conversas restritas/).count(),0)
 assert.equal(await select.inputValue(),'conversation','valid empty own subset is not an error')
 console.log('PASS real API: inaccessible newest date omitted; genuine empty threads fallback to creation without losing cards')
 await page.waitForTimeout(200)
 metaMode='hold';const beforeSlow=metadataCalls
 await page.clock.runFor(5000);await page.waitForTimeout(100)
 assert.equal(holdMeta.length,1)
 await page.clock.runFor(10000);await page.waitForTimeout(100)
 assert.equal(metadataCalls,beforeSlow+1,'slow metadata read never overlaps another poll')
 metaMode='ready'
 for(const held of holdMeta.splice(0)){
  const result=await realAPI(new Request(base+'/api/pipeline/conversation-order?pipeline_id='+held.pid))
  await held.route.fulfill({status:result.status,json:await result.json()})
 }
 await expectNames(['Ana','Bruno','Carla','Davi'])
 console.log('PASS polling single-flight while transport delayed for 10s')
 // Native regression: selectOption dispatches change even for the already selected
 // option and masks this bug. Only real key presses/clicks/taps in this matrix.
 const preference=()=>page.evaluate(id=>localStorage.getItem('l4p:pipeline-order:v1:'+id),authA)
 const nativeSelect=async key=>{await select.focus();await page.keyboard.press(key);await page.keyboard.press('Enter');await page.keyboard.press('Tab')}
 const matrix=[]
 for(const route of ['/dashboard/pipeline','/m/pipeline']) {
  const mobile=route.startsWith('/m/')
  await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000})
  for(const status of ['error','restricted'])for(const input of ['keyboard','pointer']) {
   metaMode='ready'
   await page.goto(base+route);await select.waitFor()
   await nativeSelect('Home');await expectNames(['Ana','Bruno','Carla','Davi'])
   assert.equal(await preference(),'newest')
   metaMode=status;await nativeSelect('End')
   const indicator=page.getByLabel(status==='error'?/Conversas indisponíveis/:/Conversas restritas/)
   await indicator.waitFor()
   assert.equal(await select.inputValue(),'newest','fallback selector remains honest')
   assert.equal(await preference(),'conversation','failure must not silently rewrite preference')
   const closedBox=await select.boundingBox()
   // Same native option is a no-op, not a preference change. The explicit
   // popover action must remain available to resolve this divergence.
   await nativeSelect('Home')
   assert.equal(await preference(),'conversation','same native option emits no change')
   await page.reload();await indicator.waitFor()
   assert.equal(await preference(),'conversation','preference survives reload until explicit action')
   const chooseNewest=page.getByRole('button',{name:'Usar Mais novos',exact:true})
   if(input==='keyboard') {
    await select.focus();await page.keyboard.press('Tab')
    assert.equal(await indicator.evaluate(el=>el===document.activeElement),true)
    await page.keyboard.press('Enter')
   } else if(mobile)await indicator.tap()
   else await indicator.click()
   await chooseNewest.waitFor()
   assert.equal(await preference(),'conversation','opening hint must not change preference')
   if(status==='error')assert.equal(await page.getByRole('button',{name:'Tentar novamente',exact:true}).isVisible(),true)
   await page.screenshot({path:path.join(output,`${mobile?'mobile':'desktop'}-${status}-${input}-action.png`),fullPage:true})
   if(input==='keyboard') {
    await page.keyboard.press('Tab')
    if(status==='error')await page.keyboard.press('Tab') // Existing retry precedes explicit fallback action.
    assert.equal(await chooseNewest.evaluate(el=>el===document.activeElement),true)
    await page.keyboard.press('Enter')
   } else if(mobile)await chooseNewest.tap()
   else await chooseNewest.click()
   assert.equal(await preference(),'newest','explicit fallback preference is persisted')
   assert.equal(await select.inputValue(),'newest')
   await expectNames(['Ana','Bruno','Carla','Davi'])
   await indicator.waitFor({state:'detached'})
   const afterBox=await select.boundingBox()
   assert.ok(Math.abs(closedBox.y-afterBox.y)<1,'no extra main-layout line')
   metaMode='ready';dates={a:'2029-01-01T00:00:00Z',b:null,c:'2026-09-29T12:00:00Z',d:'2026-09-30T12:00:00Z',e:null}
   const beforeReload=metadataCalls
   await page.reload();await expectNames(['Ana','Bruno','Carla','Davi'])
   assert.equal(await select.inputValue(),'newest','reload retains explicit newest, even after service recovery')
   assert.equal(await preference(),'newest');assert.equal(metadataCalls,beforeReload,'newest stays lazy after reload')
   // Retrying conversation through native selection still works in both failure states.
   metaMode=status;await nativeSelect('End');await indicator.waitFor()
   metaMode='ready';await page.clock.runFor(5000);await nativeSelect('End')
   await expectNames(['Davi','Carla','Ana','Bruno'])
   assert.equal(await select.inputValue(),'conversation');assert.equal(await preference(),'conversation')
   if(status==='error') {
    // Keep the existing popover retry operational as well.
    await nativeSelect('Home');metaMode='error';await nativeSelect('End');await indicator.waitFor()
    await indicator.click();metaMode='ready';await page.clock.runFor(5000)
    await page.getByRole('button',{name:'Tentar novamente',exact:true}).click()
    await expectNames(['Davi','Carla','Ana','Bruno']);assert.equal(await preference(),'conversation')
   }
   matrix.push({route,status,input,persistedAfterReload:'newest',retry:'conversation',passed:true})
   console.log('PASS native newest persistence and conversation retry',JSON.stringify(matrix.at(-1)))
  }
 }
 await writeFile(path.join(output,'native-newest-matrix.json'),JSON.stringify(matrix,null,2))
 assert.equal(external,0);assert.equal(writes.length,0);assert.deepEqual(errors,[])
} finally {await browser.close();await new Promise(r=>server.close(r))}
