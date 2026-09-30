// Local-only real React page harness. Network is blocked except this fixture server.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/pipeline-stage-actions-browser.mjs
import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const root = process.cwd()
const native = createRequire(import.meta.url)
async function serverModule(entry) {
 const {outputFiles} = await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',packages:'external'})
 const m={exports:{}}
 new Function('require','module','exports',outputFiles[0].text)(native,m,m.exports)
 return m.exports
}
const {proxy} = await serverModule('src/proxy.ts')
const {fixtureLayout} = await serverModule('tests/helpers/pipeline-layout-fixture.ts')
const {NextRequest} = native('next/server')
const one='11111111-1111-1111-1111-111111111111',two='22222222-2222-2222-2222-222222222222'
const member='33333333-3333-3333-3333-333333333333'
const output = await mkdtemp(path.join(process.env.TMPDIR || '/home/hermes/.hermes/profiles/lead4pro/cache/scratch', 'pipeline-stage-actions-ui-'))
console.log('Evidence:', output)
await build({ entryPoints: ['tests/pipeline-stage-actions-browser-entry.tsx'], bundle: true, outfile: path.join(output, 'app.js'), platform: 'browser', jsx: 'automatic', alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_SUPABASE_URL':'"https://fixture.invalid"', 'process.env': '{}' }, plugins:[{name:'offline-realtime',setup(b){b.onResolve({filter:/use-realtime$/},()=>({path:'realtime',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function useRealtime() {}'}))}}] })
const css = await postcss([tailwind({ base: root })]).process(await readFile('src/app/globals.css', 'utf8'), { from: path.join(root, 'src/app/globals.css') })
await writeFile(path.join(output, 'app.css'), css.css + (await readFile('src/app/m/m-theme.css','utf8')).replace(/^@import.*$/gm,''))
const fontCSS = '@font-face{font-family:GeistFixture;src:url(/geist.woff2) format("woff2");font-weight:100 900;font-display:swap}'
const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>' + fontCSS + '</style></head><body style="font-family:GeistFixture,Arial,sans-serif"><div id="root"></div><script src="/app.js"></script></body></html>'
const server = http.createServer(async (req, res) => {
  if (req.url === '/geist.woff2') { res.setHeader('Content-Type', 'font/woff2'); res.end(await readFile(path.join(root, 'src/fonts/geist-latin.woff2'))); return }
  if (req.url === '/app.js' || req.url === '/app.css') { res.setHeader('Content-Type', req.url.endsWith('css') ? 'text/css' : 'text/javascript'); res.end(await readFile(path.join(output, req.url.slice(1)))) }
  else {
   // Execute the actual Next proxy and actual selected server layout, with only service I/O fixtures.
   const request=new NextRequest(`http://${req.headers.host}${req.url}`,{headers:req.headers})
   const response=proxy(request)
   if(response.headers.has('set-cookie'))res.setHeader('set-cookie',response.headers.get('set-cookie'))
   if(response.headers.has('location')){res.writeHead(response.status,{location:new URL(response.headers.get('location')).pathname+new URL(response.headers.get('location')).search});res.end();return}
   let document=html
   const kind=request.nextUrl.pathname.startsWith('/m')?'m':request.nextUrl.pathname.startsWith('/dashboard')?'dashboard':null
   if(kind){
    try {
     const tree=await fixtureLayout(kind,req.headers['user-agent']||'',!!req.headers.cookie?.includes('l4p_app='))({children:React.createElement('div',{id:'root'})})
     document=html.replace('<div id="root"></div>',renderToStaticMarkup(tree))
    }catch(error){
     if(error.message.startsWith('redirect:')){res.writeHead(307,{location:error.message.slice(9)});res.end();return}
     throw error
    }
   }
   res.setHeader('Content-Type', 'text/html'); res.end(document)
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true })
try {
 const page=await browser.newPage({viewport:{width:1440,height:900},hasTouch:true})
 page.setDefaultTimeout(3000)
 const noPopover = process.env.NO_POPOVER_API === '1'
 if(noPopover) await page.addInitScript(()=>{
  // Simulate an unsupported engine, including ignored attributes (not physical iOS).
  const set=Element.prototype.setAttribute
  Element.prototype.setAttribute=function(name,value){return set.call(this,['popover','popovertarget'].includes(name)?'data-unsupported-'+name:name,value)}
  for(const name of ['hidePopover','showPopover','togglePopover','popover']) delete HTMLElement.prototype[name]
 })
 page.on('pageerror',error=>console.error('Browser error:',error.message,error.stack))
 page.on('console',message=>{if(message.type()==='error')console.error('Browser console:',message.text())})
 let writes=0,external=0,mode='ready',hold=null,pseudoRequests=0,metadataRequests=0
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message))
 const seq={id:'seq',name:'Sequência certa',enabled:false,sequence_steps:[],trigger_stage_id:'stage'}
 const auto={id:'auto',name:'Automação certa',enabled:true,trigger_type:'stage_entered',trigger_config:{stage_id:'stage'},action_type:'notify_agent',action_config:{}}
 const activeSeq={...seq,id:'seq2',name:'Sequência ativa fixture',enabled:true}
 const stages=[{id:'inactive',sequences:[seq],automations:[{...auto,id:'disabled-auto',enabled:false}]},{id:'empty',sequences:[],automations:[]},{id:'stage',sequences:[seq,activeSeq,{...seq,id:'seq3',name:'Terceira',enabled:true}],automations:[auto]}]
 stages.push({id:'seq-only',sequences:[activeSeq],automations:[]},{id:'auto-only',sequences:[],automations:[auto]},{id:'mixed',sequences:[seq,activeSeq],automations:[auto]},{id:'long',sequences:[activeSeq],automations:[]},{id:'won',sequences:[],automations:[]})
 const boardStages=['Novo lead','Sem ações','Só inativas','Contato','Agendado','Proposta','Negociação com um título muito longo para testar truncamento','Fechado'].map((name,i)=>({id:['stage','empty','inactive','seq-only','auto-only','mixed','long','won'][i],name,position:i,color:['#6366f1','#64748b','#f59e0b','#06b6d4','#a855f7','#f97316','#ec4899','#22c55e'][i]}))
 const cards=boardStages.map((s,i)=>({id:'card-'+i,stage_id:s.id,lead:{id:'lead-'+i,name:'Lead exemplo '+(i+1),phone:'',state:'FL',city:'',interest:'Fixture sem dados pessoais',type:'manual',created_at:'2026-09-30T12:00:00Z',contract_closed:false}}))
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin!==`http://127.0.0.1:${server.address().port}`){external++;return route.abort()}
  if(url.pathname.startsWith('/api/')) {
   if(req.method()!=='GET'){writes++;throw Error('Unexpected write')}
   if(url.pathname==='/api/sequences')return route.fulfill({json:{buyer_id:'owner',sequences:[seq,activeSeq],templates:[],pipelines:[]}})
   if(url.pathname==='/api/automations')return route.fulfill({json:{buyer_id:'owner',automations:[auto]}})
   if(url.pathname==='/api/templates')return route.fulfill({json:{templates:[]}})
   if(url.pathname==='/api/m/team-context')return route.fulfill({json:{buyer_id:'owner'}})
   if(url.pathname==='/api/whatsapp/unread')return route.fulfill({json:{total:0,by_lead:{}}})
   if(url.pathname==='/api/settings')return route.fulfill({json:{id:'owner',is_agency:true}})
   if(url.pathname==='/api/team/members')return route.fulfill({json:{members:[{id:member,name:'Member fixture',is_active:true}]}})
   if(url.pathname==='/api/team/leads')return route.fulfill({json:{leads:[]}})
   if(url.pathname==='/api/team/member-pipeline')return route.fulfill({json:{member:{id:member,has_own_pipeline:false},pipeline:{id:'pseudo-pipe-'+member,name:'Leads atribuídos',stages:[{id:'pseudo-'+member,name:'Atribuídos',color:'#6366f1',position:0}]},leads:[]}})
   if(url.pathname==='/api/pipelines')return route.fulfill({json:{pipelines:[{id:one,name:'Fixture pipeline',is_default:true,stages:boardStages}]}})
   if(url.pathname===`/api/pipelines/${one}/leads`)return route.fulfill({json:{leads:cards}})
   if(url.pathname==='/api/pipeline/stage-actions'){
    metadataRequests++
    if(url.searchParams.get('pipeline_id')?.startsWith('pseudo-')){pseudoRequests++;return route.fulfill({status:400,json:{error:'Invalid UUID'}})}
    if(mode==='hold') {hold=route;return}
    if(mode==='error')return route.fulfill({status:503,json:{error:'fixture'}})
    if(mode==='restricted')return route.fulfill({status:403,json:{error:'fixture'}})
    return route.fulfill({json:{pipeline_id:url.searchParams.get('pipeline_id'),stages}})
   }
   throw Error('Unexpected API '+url.pathname)
  }
  return route.continue()
 })
 const base=`http://127.0.0.1:${server.address().port}`
 await page.goto(base+'/dashboard/sequences?edit=seq&returnTo=%2Fm%2Fpipeline')
 await page.getByRole('dialog').waitFor()
 assert.equal(await page.getByLabel('Nome da sequência',{exact:true}).inputValue(),'Sequência certa')
 await page.getByRole('button',{name:'Cancelar',exact:true}).click()
 assert.equal(await page.getByRole('link',{name:'Voltar ao pipeline'}).getAttribute('href'),'/m/pipeline')
 await page.goto(base+'/dashboard/sequences?edit=foreign')
 await page.getByRole('alert').filter({hasText:'Item indisponível nesta conta'}).waitFor()
 assert.equal(await page.getByRole('dialog').count(),0)
 await page.goto(base+'/dashboard/automations?edit=auto&returnTo=https://evil.invalid')
 await page.getByRole('heading',{name:'Editar automação',exact:true}).waitFor()
 await page.setViewportSize({width:320,height:844})
 const dialogBox=await page.getByRole('dialog',{name:'Editar automação',exact:true}).boundingBox()
 assert.ok(dialogBox.x>=0 && dialogBox.x+dialogBox.width<=320)
 assert.equal(await page.getByPlaceholder('Ex.: Acompanhamento de 24h').inputValue(),'Automação certa')
 await page.getByRole('button',{name:'Cancelar',exact:true}).click()
 assert.equal(await page.getByRole('link',{name:'Voltar ao pipeline'}).getAttribute('href'),'/dashboard/pipeline')
 await page.setViewportSize({width:2560,height:900})
 await page.goto(base+'/board')
 const trigger=page.getByRole('button',{name:'Ações ativas de Novo lead',exact:true})
 const popup=page.getByRole('dialog',{name:'Ações ativas de Novo lead',exact:true})
 await trigger.waitFor()
 await page.screenshot({path:path.join(output,'initial-panels.png'),fullPage:true})
 assert.equal(await page.getByRole('dialog').count(),0,'P1: every panel starts collapsed, also without Popover API')
 const measure=()=>page.locator('[data-fixture-board] h3').evaluateAll(nodes=>nodes.map(n=>{const header=n.closest('.sticky');const column=header.parentElement;return {titleY:n.getBoundingClientRect().y,titleH:n.getBoundingClientRect().height,barY:header.lastElementChild.getBoundingClientRect().y,headerH:header.getBoundingClientRect().height,cardY:column.children[1].firstElementChild.getBoundingClientRect().y,cardH:column.children[1].firstElementChild.getBoundingClientRect().height}}))
 const geometry=await measure()
 assert.equal(geometry.length,8)
 for(const key of ['titleY','titleH','barY','headerH','cardY','cardH'])assert.equal(new Set(geometry.map(g=>g[key])).size,1,`ALL eight columns align: ${key}`)
 assert.equal(await page.locator('[data-fixture-board] button[aria-label^="Ações ativas"]').count(),5)
 assert.equal(await page.locator('button button').count(),0)
 for(const name of ['Sem ações','Só inativas','Fechado']) assert.equal(await page.getByRole('heading',{name,exact:true}).locator('..').getByRole('button').count(),0,'confirmed inactive/empty has no icon or reserved slot')
 const titleBox=await page.getByRole('heading',{name:'Novo lead',exact:true}).boundingBox()
 const controlBox=await trigger.boundingBox()
 assert.ok(controlBox.x>=titleBox.x+titleBox.width && Math.abs(controlBox.y+controlBox.height/2-titleBox.y-titleBox.height/2)<1)
 const longTitle=page.getByRole('heading',{name:/Negociação com/})
 assert.ok(await longTitle.evaluate(el=>el.clientWidth>140 && el.scrollWidth>el.clientWidth && getComputedStyle(el).textOverflow==='ellipsis'))
 await page.screenshot({path:path.join(output,'desktop-8-columns-COLLAPSED.png'),fullPage:true})
 await trigger.focus();await page.keyboard.press('Enter')
 await popup.waitFor()
 assert.deepEqual(await measure(),geometry,'opening top-layer panel must not move ANY title/bar/card')
 assert.equal(await popup.locator('section').count(),2)
 await page.keyboard.press('Tab')
 assert.equal(await page.getByRole('link',{name:'Editar Sequência ativa fixture',exact:true}).evaluate(el=>el===document.activeElement),true,'Tab reaches first single-click edit link')
 assert.equal(await page.getByRole('link',{name:'Editar Sequência certa',exact:true}).count(),0)
 assert.equal(await page.getByRole('link',{name:'Editar Sequência ativa fixture',exact:true}).getAttribute('href'),'/m/sequences?edit=seq2&returnTo=%2Fm%2Fpipeline')
 await page.keyboard.press('Escape')
 await popup.waitFor({state:'hidden'})
 assert.equal(await trigger.evaluate(el=>el===document.activeElement),true,'Escape restores trigger focus')
 await trigger.click();await popup.waitFor()
 await page.getByRole('button',{name:'Fechar ações',exact:true}).click()
 assert.equal(await trigger.evaluate(el=>el===document.activeElement),true)
 await trigger.focus();await page.keyboard.press('Space');await popup.waitFor()
 await page.mouse.click(700,600);await popup.waitFor({state:'hidden'})
 await writeFile(path.join(output,'geometry.json'),JSON.stringify({collapsed:geometry,afterClose:await measure()},null,2))
 for(const width of [1440,320,390]){
  await page.setViewportSize({width,height:844})
  await page.screenshot({path:path.join(output,`board-${width}-COLLAPSED.png`),fullPage:true})
  await trigger.click();await popup.waitFor()
  const box=await popup.boundingBox()
  assert.ok(box.x>=8 && box.x+box.width<=width-8 && box.y>=8 && box.y+box.height<=844-8)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.screenshot({path:path.join(output,`board-${width}-popup.png`),fullPage:true})
  await page.keyboard.press('Escape')
 }
 // Horizontal clipping and sticky overflow cannot cover the portaled popup.
 await page.locator('[data-fixture-board]').evaluate(el=>el.scrollLeft=1700)
 const longControl=page.getByRole('button',{name:/Ações ativas de Negociação/})
 await longControl.click()
 const longPopup=page.getByRole('dialog',{name:/Ações ativas de Negociação/})
 await longPopup.waitFor()
 assert.ok(await longPopup.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+20,r.y+20))}))
 await page.keyboard.press('Escape')
 await page.locator('[data-fixture-board]').evaluate(el=>el.scrollLeft=0)
 mode='hold';await page.getByRole('button',{name:'Switch fixture'}).click()
 await page.locator('[aria-busy=true]').first().waitFor({state:'attached'})
 assert.deepEqual(await measure(),geometry,'loading metadata must not move headers or cards')
 assert.equal(await page.locator('button[aria-label^="Ações ativas"]').count(),0)
 mode='error';await page.getByRole('button',{name:'Switch fixture'}).click()
 const info=page.getByRole('button',{name:'Informações sobre ações de Novo lead',exact:true})
 await info.waitFor();await info.click()
 assert.deepEqual(await measure(),geometry,'neutral error control and popup must not move headers or cards')
 await page.getByRole('dialog').getByText('Indisponível',{exact:true}).waitFor()
 if(hold)await hold.fulfill({json:{pipeline_id:two,stages}})
 await page.waitForTimeout(100)
 assert.equal(await page.locator('button[aria-label^="Ações ativas"]').count(),0)
 mode='restricted';await page.getByRole('button',{name:'Tentar novamente'}).click()
 await info.waitFor();await info.click()
 await page.getByRole('dialog').getByText('Somente o dono da conta pode consultar e editar estas ações.').waitFor()
 assert.equal(await page.getByRole('link').count(),0)
 await page.keyboard.press('Escape')
 mode='ready';await page.getByRole('button',{name:'Switch fixture'}).click()
 await trigger.waitFor()
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844})
  await page.goto(base+'/m/pipeline');await trigger.waitFor()
  const mobileTitle=await page.locator('.m-chip.on').boundingBox()
  const mobileControl=await trigger.boundingBox()
  assert.ok(mobileControl.y>=mobileTitle.y && mobileControl.y+mobileControl.height<=mobileTitle.y+mobileTitle.height)
  assert.equal(await page.locator('button button').count(),0)
  await page.screenshot({path:path.join(output,`mobile-${width}-COLLAPSED.png`),fullPage:true})
  await trigger.tap();await popup.waitFor()
  assert.deepEqual(await page.locator('.m-chip.on').boundingBox(),mobileTitle)
  assert.equal(await page.locator('.m-root').evaluate(el=>getComputedStyle(el).getPropertyValue('--m-bg').trim()),'#0b0b12')
  assert.equal(await popup.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(11, 11, 18)')
  await page.screenshot({path:path.join(output,`mobile-${width}-popup.png`),fullPage:true})
  await page.touchscreen.tap(width-20,70);await popup.waitFor({state:'hidden'})
  await page.getByRole('button',{name:'Sem ações 1',exact:true}).click()
  assert.equal(await page.locator('button[aria-label^="Ações ativas"]').count(),0)
  const emptyY=(await page.locator('.m-chip.on').boundingBox()).y
  await page.getByRole('button',{name:'Só inativas 1',exact:true}).click()
  assert.equal(await page.locator('button[aria-label^="Ações ativas"]').count(),0)
  assert.equal((await page.locator('.m-chip.on').boundingBox()).y,emptyY)
  assert.equal(mobileTitle.y,emptyY,'active/inactive/empty selectors share one line with no extra strip')
 }
 // Exercise translated controls and exact links in real desktop/mobile renderings.
 for(const [locale,label,closeLabel,edit] of [['pt','Ações ativas de Novo lead','Fechar ações','Editar'],['en','Active actions for Novo lead','Close actions','Edit'],['es','Acciones activas de Novo lead','Cerrar acciones','Editar']]) {
  for(const [route,width] of [['/board',1440],['/m/pipeline',320]]) {
   await page.setViewportSize({width,height:844})
   await page.goto(base+route+'?locale='+locale)
   const control=page.getByRole('button',{name:label,exact:true})
   await control.waitFor()
   assert.equal(await page.getByRole('dialog').count(),0)
   await control.focus();await page.keyboard.press('Enter')
   const dialog=page.getByRole('dialog',{name:label,exact:true})
   await dialog.waitFor()
   assert.equal(await dialog.getByRole('button',{name:closeLabel,exact:true}).evaluate(el=>el===document.activeElement),true)
   const box=await dialog.boundingBox()
   assert.ok(box.x>=8 && box.x+box.width<=width-8 && box.y>=8 && box.y+box.height<=836)
   const link=dialog.getByRole('link',{name:edit+' Sequência ativa fixture',exact:true})
   assert.equal(await link.getAttribute('href'),'/m/sequences?edit=seq2&returnTo=%2Fm%2Fpipeline')
   await page.keyboard.press('Tab');assert.equal(await link.evaluate(el=>el===document.activeElement),true)
   await dialog.getByRole('button',{name:closeLabel,exact:true}).click()
   await dialog.waitFor({state:'hidden'})
   assert.equal(await control.evaluate(el=>el===document.activeElement),true)
   await control.click();await dialog.waitFor()
   await control.click();await dialog.waitFor({state:'hidden'})
   assert.equal(await control.getAttribute('aria-expanded'),'false','trigger toggles closed')
  }
 }
 stages.find(s=>s.id==='stage').sequences.push(...Array.from({length:15},(_,i)=>({...activeSeq,id:`long-${i}`,name:'Nome muito longo '.repeat(8)})))
 await page.goto(base+'/board');await trigger.click();await popup.waitFor()
 assert.ok(await popup.evaluate(el=>el.scrollHeight>el.clientHeight),'long action lists scroll inside popup')
 await page.setViewportSize({width:320,height:420})
 await page.waitForTimeout(50)
 const shortBox=await popup.boundingBox()
 assert.ok(shortBox.x>=8 && shortBox.x+shortBox.width<=312 && shortBox.y>=8 && shortBox.y+shortBox.height<=412,'open popup reclamps on viewport resize')
 await popup.getByRole('link').last().scrollIntoViewIfNeeded()
 assert.ok(await popup.getByRole('link').last().evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}))
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 // P2: real focus-triggered hook refresh removes the panel, then remounts ready.
 // Run in both API modes, on desktop board and actual mobile, without changing the hook.
 for(const [route,width] of [['/board',1440],['/m/pipeline',320],['/m/pipeline',390]]) {
  await page.setViewportSize({width,height:844})
  await page.goto(base+route);await trigger.waitFor()
  assert.equal(await page.getByRole('dialog').count(),0)
  const stable=route==='/board'?await measure():await page.locator('.m-chip.on').boundingBox()
  const checkOpen=async()=>{
   await popup.waitFor()
   await page.waitForFunction(()=>document.activeElement?.closest('[role=dialog]') !== null)
   const box=await popup.boundingBox(),anchor=await trigger.boundingBox()
   assert.ok(box.x>=8 && box.x+box.width<=width-8 && box.y>=8 && box.y+box.height<=836,'popup clamped on every open')
   assert.ok(box.y>0 && box.x>0,'not the broken origin placement')
   assert.equal(await trigger.getAttribute('aria-expanded'),'true')
   assert.equal(await popup.evaluate(el=>el.contains(document.activeElement)),true,'every open focuses the remounted panel')
   assert.equal(await popup.evaluate(el=>el.parentElement===document.body && !el.hidden),true,'open overlay is outside clipping ancestors in both API modes')
   assert.ok(await popup.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+20,r.y+20))}),'not clipped by sticky/overflow')
   assert.deepEqual(route==='/board'?await measure():await page.locator('.m-chip.on').boundingBox(),stable,'no layout shift')
   return {box,anchor}
  }
  await trigger.tap();const before=await checkOpen()
  mode='hold';hold=null
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.locator('[aria-busy=true]').first().waitFor({state:'attached'})
  assert.equal(await page.getByRole('dialog').count(),0,'loading removes the open panel')
  for(let i=0;!hold && i<100;i++)await page.waitForTimeout(10)
  assert.ok(hold,'focus actually requested metadata')
  mode='ready';await hold.fulfill({json:{pipeline_id:one,stages}})
  await trigger.waitFor()
  const remounted={expanded:await trigger.getAttribute('aria-expanded'),visible:await popup.count()}
  await writeFile(path.join(output,`refresh-${route==='/board'?'desktop':'mobile'}-${width}.json`),JSON.stringify({before,remounted},null,2))
  assert.equal(remounted.expanded,'false','P2: ready remount must reset stale open state')
  assert.equal(remounted.visible,0)
  await trigger.tap();const reopened=await checkOpen()
  assert.deepEqual(reopened,before,'reopening restores anchored geometry, not auto/0,0')
  await page.screenshot({path:path.join(output,`refresh-${width}-reopened.png`),fullPage:true})
  await page.keyboard.press('Escape');await popup.waitFor({state:'hidden'})
  assert.equal(await trigger.evaluate(el=>el===document.activeElement),true)
 }
 // Agency's actual page receives the legitimate virtual board. It must not request UUID metadata.
 await page.context().addCookies([{name:'sb-fixture-auth-token',value:encodeURIComponent(Buffer.from(JSON.stringify({access_token:'fixture.'+Buffer.from(JSON.stringify({sub:'fixture-user'})).toString('base64')+'.fixture'})).toString('base64')),url:base}])
 await page.setViewportSize({width:1440,height:900})
 await page.goto(base+'/dashboard/pipeline')
 await trigger.waitFor()
 for (const name of ['Sem ações','Só inativas']) {
  const title=page.getByRole('heading',{name,exact:true})
  const header=title.locator('../../..')
  assert.equal(await header.locator('details,[role=status],[aria-label^="Ações de"]').count(),0)
  const metrics=await header.evaluate(el=>({top:el.getBoundingClientRect().top,padding:parseFloat(getComputedStyle(el).paddingTop),first:el.firstElementChild.getBoundingClientRect().top}))
  assert.equal(metrics.first,metrics.top+metrics.padding,'empty/inactive desktop header has no reserved action gap')
 }
 const ownActions=trigger
 const ownTitle=page.getByRole('heading',{name:'Novo lead',exact:true})
 assert.ok(Math.abs((await ownActions.boundingBox()).y-(await ownTitle.boundingBox()).y)<4)
 await page.screenshot({path:path.join(output,'desktop-real-page-COLLAPSED.png'),fullPage:true})
 await ownActions.click()
 const ownHref=await page.getByRole('link',{name:'Editar Sequência ativa fixture',exact:true}).getAttribute('href')
 assert.equal(new URL(ownHref,base).pathname,'/dashboard/sequences')
 assert.equal(new URL(ownHref,base).searchParams.get('edit'),'seq2')
 assert.equal(new URL(ownHref,base).searchParams.get('returnTo'),`/dashboard/pipeline?pipeline=${one}`)
 await page.screenshot({path:path.join(output,'desktop-personal-active-empty-inactive.png'),fullPage:true})
 await page.keyboard.press('Escape')
 await page.getByRole('button',{name:/Time|Team|Equipe/}).click()
 await page.getByRole('button',{name:'Informações sobre ações de Atribuídos'}).click()
 await page.getByText('Não se aplica',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Tentar novamente',exact:true}).count(),0)
 assert.equal(await page.getByRole('link',{name:/Editar/}).count(),0)
 assert.equal(pseudoRequests,0)
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await page.waitForTimeout(100)
 assert.equal(pseudoRequests,0)
 await page.screenshot({path:path.join(output,'agency-pseudo-informative.png'),fullPage:true})
 // Navigate FROM the real mobile strip through the actual proxy/layout for UA AND cookie-only.
 await page.setViewportSize({width:390,height:844})
 for(const signal of ['ua','cookie']){
  const width=signal==='ua'?320:390
  await page.setViewportSize({width,height:844})
  await page.context().clearCookies()
  await page.setExtraHTTPHeaders(signal==='ua'?{'user-agent':'Lead4ProApp iOS'}:{})
  if(signal==='cookie')await page.context().addCookies([{name:'l4p_app',value:'1',url:base}])
  for(const [kind,name,id] of [['sequences','Sequência ativa fixture','seq2'],['automations','Automação certa','auto']]){
   await page.goto(base+'/m/pipeline')
   await trigger.waitFor()
   const stripBox=await trigger.boundingBox()
   const chipBox=await page.locator('.m-chip.on').boundingBox()
   assert.ok(stripBox.y>=chipBox.y && stripBox.y+stripBox.height<=chipBox.y+chipBox.height)
   await trigger.click()
   await page.getByRole('link',{name:`Editar ${name}`,exact:true}).click()
   await page.getByRole('dialog').waitFor()
   assert.equal(new URL(page.url()).pathname,`/m/${kind}`)
   assert.equal(new URL(page.url()).searchParams.get('edit'),id)
   assert.equal(await page.getByRole('link',{name:'Voltar ao pipeline'}).getAttribute('href'),'/m/pipeline')
   assert.equal(await page.getByRole('dialog').locator('input').first().inputValue(),name)
   assert.equal(await page.locator('[data-theme=dark]').evaluate(el=>getComputedStyle(el).getPropertyValue('--accent-light').trim()),'#251d49')
   const box=await page.getByRole('dialog').boundingBox()
   assert.ok(box.x>=0 && box.x+box.width<=width,'native dialog must fit viewport')
   await page.screenshot({path:path.join(output,`native-${signal}-${kind}-editor.png`),fullPage:true})
   await page.getByRole('button',{name:'Cancelar',exact:true}).click()
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
   await page.getByRole('link',{name:'Voltar ao pipeline'}).click()
   assert.equal(new URL(page.url()).pathname,'/m/pipeline')
   // Forged return URL must never send the native app outside its route family.
   await page.goto(base+`/m/${kind}?edit=${id}&returnTo=https://evil.invalid`)
   await page.getByRole('dialog').waitFor()
   assert.equal(await page.getByRole('link',{name:'Voltar ao pipeline'}).getAttribute('href'),'/m/pipeline')
   if(kind==='automations'){
    await page.goto(base+`/m/automacoes?edit=${id}&returnTo=/m/pipeline`)
    await page.getByRole('dialog').waitFor()
    assert.equal(await page.getByRole('dialog').locator('input').first().inputValue(),name)
    assert.equal(await page.getByRole('link',{name:'Voltar ao pipeline'}).getAttribute('href'),'/m/pipeline')
   }
   await page.goto(base+`/dashboard/${kind}?edit=${id}`)
   assert.equal(new URL(page.url()).pathname,'/m')
  }
 }
 assert.deepEqual(pageErrors,[])
 assert.equal(writes,0);assert.equal(external,0)
 console.log(JSON.stringify({result:'PASS',popoverAPI:noPopover?'absent-simulation':'available',pageErrors,writes,external,pseudoRequests,metadataRequests,output}))
} finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
