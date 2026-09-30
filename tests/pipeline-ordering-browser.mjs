// Offline real-page React/browser fixture; no production services or writes.
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdtemp} from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import {build} from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
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
const one='11111111-1111-4111-8111-111111111111',two='22222222-2222-4222-8222-222222222222',authA='33333333-3333-4333-8333-333333333333',authB='44444444-4444-4444-8444-444444444444'
let external=0,writes=[],metadataCalls=0,identity=authA,metaMode='ready',holdMeta=[],holdLeads=[],holdBoard=false,holdPatch=false,pendingPatch=[]
const stages=[{id:'s1',name:'Novos',position:0,color:'#6366f1'},{id:'s2',name:'Em contato',position:1,color:'#06b6d4'},{id:'s3',name:'Proposta',position:2,color:'#f59e0b'}]
const make=(id,name,date,stage='s1')=>({id:'p'+id,stage_id:stage,moved_at:'2026-09-30T12:00:00Z',lead:{id,name,created_at:date,phone:'',state:'FL',email:'',interest:'Seguro de vida',type:'manual',contract_closed:false}})
let cards=[make('a','Ana','2026-09-04'),make('b','Bruno','2026-09-03'),make('c','Carla','2026-09-02'),make('d','Davi','2026-09-01'),make('e','Elisa','2026-09-05','s2')]
let dates={a:null,b:null,c:'2026-09-29T12:00:00Z',d:'2026-09-30T12:00:00Z',e:null}
const data=(pid=one)=>({auth_user_id:identity,pipeline_id:pid,conversations:Object.entries(dates).map(([lead_id,last_whatsapp_at])=>({lead_id,last_whatsapp_at}))})
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(5000)
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
   if(metaMode==='error')return route.fulfill({status:503,json:{error:'unavailable'}})
   if(metaMode==='restricted')return route.fulfill({status:403,json:{error:'restricted'}})
   return route.fulfill({json:data(pid)})
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
 await page.reload();await expectNames(['Davi','Carla','Ana','Bruno']);assert.equal(await select.inputValue(),'conversation')
 await page.getByRole('button',{name:'Filtros',exact:true}).click()
 await page.getByPlaceholder(/Nome, email/).fill('Ana');await page.getByText('Ana',{exact:true}).waitFor();assert.deepEqual(await names(),['Ana'])
 await page.getByPlaceholder(/Nome, email/).fill('');await page.getByRole('button',{name:'Filtros',exact:true}).click()
 await expectNames(['Davi','Carla','Ana','Bruno'])
 console.log('PASS real desktop default, persisted orders, empty-thread fallback, filters, inline collapsed lightning; writes=0')
 // Selection/gesture races use the real page and PointerSensor, not mocked handlers.
 const col=name=>page.getByRole('heading',{name,exact:true}).locator('xpath=../../../..')
 const columnNames=name=>col(name).getByText(/^(Ana|Bruno|Carla|Davi)$/).allTextContents()
 const selectionFailures=[]
 const selectionCases=[
  ['cancel','during'],['end','during'],
  ['cancel','after'],['end','after'],
  ['cancel','pointerdown'],['end','pointerdown'],
  ['cancel','before-activation'],['end','before-activation'],
 ]
 for(const [finish,timing] of selectionCases){
  holdBoard=false
  await page.goto(base+'/dashboard/pipeline')
  await expectNames(['Davi','Carla','Ana','Bruno'])
  let start=await col('Novos').getByText('Ana',{exact:true}).boundingBox()
  const beforeWrites=writes.length
  const beforeCards=structuredClone(cards)
  holdBoard=true
  if(timing==='pointerdown'||timing==='before-activation'){
   await page.mouse.move(start.x+10,start.y+7);await page.mouse.down()
  }
  await page.locator('select').first().selectOption(two)
  await page.waitForTimeout(60)
  assert.equal(holdLeads.length,1,'explicit B request is held')
  assert.match(await page.getByRole('status').first().innerText(),/Carregando funil.*Vendas/)
  assert.equal(await page.locator('select').first().inputValue(),two)
  const reply=async()=>{
   holdBoard=false
   for(const r of holdLeads.splice(0))await r.fulfill({json:{leads:cards}})
   await page.waitForTimeout(100)
  }
  if(timing==='before-activation')await reply()
  if(timing!=='pointerdown'&&timing!=='before-activation'){
   // The pending-selection banner shifts the board: target the actual Ana card,
   // not the pre-banner coordinates (which can hit a different card).
   start=await col('Novos').getByText('Ana',{exact:true}).boundingBox()
   await page.mouse.move(start.x+10,start.y+7);await page.mouse.down()
  }
  const target=await col('Em contato').boundingBox()
  await page.mouse.move(start.x+35,start.y+10,{steps:5})
  await page.mouse.move(target.x+130,target.y+210,{steps:20})
  await page.waitForTimeout(60)
  const oldCardMoved=await col('Em contato').getByText('Ana',{exact:true}).count()>0
  if(timing==='during'||timing==='pointerdown')await reply()
  if(finish==='cancel')await page.keyboard.press('Escape')
  await page.mouse.up()
  if(timing==='after')await reply()
  await page.evaluate(()=>window.dispatchEvent(new Event('fixture-pipeline_leads-INSERT')))
  await page.clock.fastForward(61000)
  await page.waitForTimeout(100)
  const result={finish,timing,oldCardMoved,pending:await page.getByText(/Carregando funil/).count(),selected:await page.locator('select').first().inputValue(),writes:writes.length-beforeWrites,selectorEnabled:await page.locator('select').first().isEnabled(),orderEnabled:await select.isEnabled()}
  await page.screenshot({path:path.join(output,`selection-${finish}-${timing}.png`),fullPage:true})
  try{
   assert.equal(result.pending,0,'selection B must settle after gesture and polling/realtime')
   assert.equal(result.selected,two,'latest selection stays B')
   assert.equal(result.oldCardMoved,false,'pending/old-board gesture cannot move cards')
   assert.equal(result.writes,0,'rejected gesture must never PATCH either board')
   assert.equal(result.selectorEnabled,true,'pipeline selection remains available after rejected gesture')
   assert.equal(result.orderEnabled,true,'rejected gesture cannot strand sort/save lock')
   console.log('PASS selection race',JSON.stringify(result))
  }catch(error){selectionFailures.push(result);console.log('FAIL selection race',JSON.stringify(result),error.message)}
  // Restore fixture after a failing RED drop without touching a real service.
  cards=beforeCards
 }
 assert.deepEqual(selectionFailures,[],'all pending selection + pointer/end/cancel regressions')
 holdBoard=false
 await page.goto(base+'/dashboard/pipeline');await expectNames(['Davi','Carla','Ana','Bruno'])
 await page.waitForTimeout(100) // Let successful initial fetch/finally and poll effects settle.
 // In-flight metadata and board read settle DURING a real pointer drag.
 holdBoard=true;metaMode='hold'
 await page.clock.fastForward(60100)
 await page.waitForFunction(()=>document.querySelector('select[aria-label="Ordenar"]'))
 await page.waitForTimeout(100) // Clock advancement queues network routes asynchronously.
 assert.ok(holdMeta.length>0);assert.ok(holdLeads.length>0)
 const drag=async()=>{
  const start=await col('Novos').getByText('Ana',{exact:true}).boundingBox()
  const target=await col('Em contato').boundingBox()
  await page.mouse.move(start.x+10,start.y+7);await page.mouse.down()
  await page.mouse.move(start.x+35,start.y+10,{steps:5})
  await page.waitForFunction(()=>document.querySelector('select[aria-label="Ordenar"]').disabled)
  await page.mouse.move(target.x+130,target.y+210,{steps:20})
  await col('Em contato').getByText('Ana',{exact:true}).waitFor()
 }
 await drag()
 assert.equal(await page.locator('select').first().isDisabled(),true,'cannot select a pipeline during an accepted drag')
 assert.deepEqual(await columnNames('Novos'),['Davi','Carla','Bruno'])
 dates={...dates,b:'2026-10-01T12:00:00Z'}
 for(const h of holdMeta.splice(0))await h.route.fulfill({json:data(h.pid)})
 for(const r of holdLeads.splice(0))await r.fulfill({json:{leads:cards}})
 await page.waitForTimeout(150)
 assert.deepEqual(await columnNames('Novos'),['Davi','Carla','Bruno'],'frozen sort ranks')
 assert.equal(await col('Em contato').getByText('Ana',{exact:true}).count(),1,'in-flight refresh cannot undo drag-over stage')
 holdBoard=false;metaMode='ready'
 await page.keyboard.press('Escape');await page.mouse.up()
 await expectNames(['Bruno','Davi','Carla','Ana']);assert.equal(writes.length,0,'cancel has no PATCH')
 // End keeps the move lock until PATCH resolves, then re-fetches rather than
 // applying a deferred old board. Only this deliberate move may write locally.
 holdBoard=true
 await page.evaluate(()=>window.dispatchEvent(new Event('fixture-pipeline_leads-INSERT')))
 await page.waitForTimeout(100);assert.ok(holdLeads.length>0)
 await drag();holdPatch=true;await page.mouse.up()
 await page.waitForTimeout(100);assert.equal(pendingPatch.length,1)
 assert.equal(await page.locator('select').first().isDisabled(),true,'cannot select a pipeline before its move is saved')
 // A second gesture while the previous move is saving must neither move a
 // different card nor release the first gesture's refresh lock.
 const second=await col('Novos').getByText('Bruno',{exact:true}).boundingBox()
 const secondTarget=await col('Proposta').boundingBox()
 await page.mouse.move(second.x+10,second.y+7);await page.mouse.down()
 await page.mouse.move(secondTarget.x+100,secondTarget.y+180,{steps:20})
 await page.waitForTimeout(100)
 assert.equal(await col('Novos').getByText('Bruno',{exact:true}).count(),1,'pending save blocks another drag-over')
 await page.keyboard.press('Escape');await page.mouse.up()
 for(const r of holdLeads.splice(0))await r.fulfill({json:{leads:cards}})
 await page.waitForTimeout(100)
 assert.equal(await col('Em contato').getByText('Ana',{exact:true}).count(),1)
 const pr=pendingPatch.shift(),body=pr.request().postDataJSON(),pid=pr.request().url().split('/').at(-1)
 cards=cards.map(c=>c.id===pid?{...c,stage_id:body.stage_id}:c)
 holdPatch=false;holdBoard=false;await pr.fulfill({json:{success:true}})
 await page.waitForFunction(()=>!document.querySelector('select[aria-label="Ordenar"]').disabled)
 assert.equal(await col('Em contato').getByText('Ana',{exact:true}).count(),1)
 assert.equal(writes.length,1);assert.deepEqual(writes[0],{path:'/api/pipeline-leads/pa',body:{stage_id:'s2',position:0}})
 console.log('PASS real pointer DND cancel/end; snapshot metadata, deferred GET, pending PATCH race; exactly one intentional LOCAL fixture PATCH')
 cards=cards.map(c=>c.id==='pa'?{...c,stage_id:'s1'}:c)
 dates={a:null,b:null,c:'2026-09-29T12:00:00Z',d:'2026-09-30T12:00:00Z',e:null}
 // Switch boards while a response is outstanding; fetch deliberately ignores AbortSignal.
 await select.selectOption('newest');metaMode='hold';await select.selectOption('conversation')
 await page.waitForTimeout(80);assert.ok(holdMeta.length>0)
 metaMode='ready';await page.locator('select').first().selectOption(two)
 await expectNames(['Davi','Carla','Ana','Bruno'])
 for(const h of holdMeta.splice(0))await h.route.fulfill({json:{...data(h.pid),conversations:[{lead_id:'a',last_whatsapp_at:'2027-01-01'}]}})
 await page.waitForTimeout(100);await expectNames(['Davi','Carla','Ana','Bruno'])
 console.log('PASS real React stale metadata response across board switch (AbortSignal ignored)')
 // Failed reads are not empty threads; manual retry is coalesced, never a loop.
 await select.selectOption('newest');metaMode='error';await select.selectOption('conversation')
 await expectNames(['Ana','Bruno','Carla','Davi'])
 await page.getByLabel(/Conversas indisponíveis/).click()
 const beforeRetry=metadataCalls
 metaMode='hold';await page.getByRole('button',{name:'Tentar novamente',exact:true}).click()
 await page.waitForTimeout(100);assert.equal(metadataCalls,beforeRetry+1)
 await page.clock.fastForward(120000);assert.equal(metadataCalls,beforeRetry+1,'no interval spam on pending/error')
 for(const h of holdMeta.splice(0))await h.route.fulfill({json:data(h.pid)})
 await expectNames(['Ana','Bruno','Carla','Davi']) // timed-out response is stale
 metaMode='ready';await page.getByRole('button',{name:'Tentar novamente',exact:true}).click()
 await expectNames(['Davi','Carla','Ana','Bruno'])
 // Team pseudo-board has no conversation permission and makes ZERO metadata reads.
 const beforeTeam=metadataCalls
 await page.getByRole('button',{name:/Meu Time/}).click();await page.getByRole('button',{name:'Membro fixture'}).click()
 await page.getByLabel(/Conversas restritas/).waitFor();assert.equal(metadataCalls,beforeTeam)
 await expectNames(['Ana','Bruno','Carla','Davi'])
 // Account B must not inherit A's selected mode or receive its metadata.
 identity=authB
 await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'sb-fixture-auth-token'})))
 await page.waitForFunction(()=>document.querySelector('select[aria-label="Ordenar"]').value==='newest')
 assert.equal(await page.evaluate(id=>localStorage.getItem('l4p:pipeline-order:v1:'+id),authA),'conversation')
 assert.equal(await page.evaluate(id=>localStorage.getItem('l4p:pipeline-order:v1:'+id),authB),null)
 console.log('PASS error/retry guard, pseudo/team restricted no metadata, current-account persistence isolation')
 // Real mobile page in scoped dark theme, PT/EN/ES at narrow viewport widths.
 for(const width of [320,390])for(const locale of ['pt','en','es']){
  await page.setViewportSize({width,height:844})
  await page.evaluate(id=>localStorage.removeItem('l4p:pipeline-order:v1:'+id),authB)
  await page.goto(base+'/m/pipeline?locale='+locale)
  const control=page.getByRole('combobox',{name:locale==='en'?'Sort':'Ordenar'})
  await expectNames(['Ana','Bruno','Carla','Davi'])
  await control.waitFor();assert.equal(await control.inputValue(),'newest')
  assert.equal(await page.locator('.m-root').evaluate(el=>getComputedStyle(el).getPropertyValue('--m-bg').trim()),'#0b0b12')
  const bounds=await control.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width)
  await page.screenshot({path:path.join(output,`mobile-${width}-${locale}-default-COLLAPSED.png`),fullPage:true})
  await control.selectOption('conversation');await expectNames(['Davi','Carla','Ana','Bruno'])
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow')
  await page.screenshot({path:path.join(output,`mobile-${width}-${locale}-conversations-COLLAPSED.png`),fullPage:true})
  // Existing mobile stage strip scrolls intentionally; its peek is not page overflow.
  const lastStage=page.getByRole('button',{name:'Proposta 0',exact:true})
  await lastStage.scrollIntoViewIfNeeded();await lastStage.click()
  assert.equal(await lastStage.getAttribute('aria-pressed'),'true')
  assert.equal(await names().then(n=>n.length),0,'ordering remains within selected stage')
  await page.getByRole('button',{name:'Novos 4',exact:true}).click()
  await expectNames(['Davi','Carla','Ana','Bruno'])
 }
 for(const locale of ['en','es']){
  await page.setViewportSize({width:1440,height:1000})
  await page.goto(base+'/dashboard/pipeline?locale='+locale)
  const control=page.getByRole('combobox',{name:locale==='en'?'Sort':'Ordenar'})
  await expectNames(['Davi','Carla','Ana','Bruno'])
  assert.equal(await control.locator('option:checked').textContent(),locale==='en'?'Recent conversations':'Conversaciones recientes')
  await control.selectOption('newest');await expectNames(['Ana','Bruno','Carla','Davi'])
  await page.screenshot({path:path.join(output,`desktop-${locale}-default-COLLAPSED.png`),fullPage:true})
  await control.selectOption('conversation')
 }
 assert.equal(writes.length,1,'sorting/mobile/retries never write')
 console.log('PASS mobile 320/390 PT/EN/ES, real selector, both orders, dark tokens, collapsed screenshots; zero external requests')

 assert.equal(external,0);assert.deepEqual(errors,[])
} finally {await browser.close();await new Promise(r=>server.close(r))}
