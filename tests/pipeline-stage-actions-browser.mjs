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
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 page.setDefaultTimeout(3000)
 page.on('pageerror',error=>console.error('Browser error:',error.message,error.stack))
 page.on('console',message=>{if(message.type()==='error')console.error('Browser console:',message.text())})
 let writes=0,external=0,mode='ready',hold=null,pseudoRequests=0,metadataRequests=0
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message))
 const seq={id:'seq',name:'Sequência certa',enabled:false,sequence_steps:[],trigger_stage_id:'stage'}
 const auto={id:'auto',name:'Automação certa',enabled:true,trigger_type:'stage_entered',trigger_config:{stage_id:'stage'},action_type:'notify_agent',action_config:{}}
 const activeSeq={...seq,id:'seq2',name:'Sequência ativa fixture',enabled:true}
 const stages=[{id:'inactive',sequences:[seq],automations:[{...auto,id:'disabled-auto',enabled:false}]},{id:'empty',sequences:[],automations:[]},{id:'stage',sequences:[seq,activeSeq,{...seq,id:'seq3',name:'Terceira',enabled:true}],automations:[auto]}]
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
   if(url.pathname==='/api/pipelines')return route.fulfill({json:{pipelines:[{id:one,name:'Fixture pipeline',is_default:true,stages:[{id:'stage',name:'Novo lead',position:0,color:'#6366f1'},{id:'empty',name:'Sem ações',position:1,color:'#6366f1'},{id:'inactive',name:'Só inativas',position:2,color:'#6366f1'}]}]}})
   if(url.pathname===`/api/pipelines/${one}/leads`)return route.fulfill({json:{leads:[]}})
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
 await page.goto(base+'/board')
 const summary=page.locator('summary').first()
 await summary.filter({hasText:'2 ativas'}).waitFor()
 const desktopStrip=await page.locator('[aria-label="Ações de Novo lead"]').boundingBox()
 const desktopTitle=await page.getByRole('heading',{name:'Novo lead',exact:true}).boundingBox()
 assert.ok(desktopStrip.y+desktopStrip.height<=desktopTitle.y,'desktop active badges above column title')
 assert.equal(await page.getByRole('link',{name:'Editar Sequência certa',exact:true}).count(),0)
 await summary.focus();await page.keyboard.press('Enter')
 assert.equal(await page.getByRole('link',{name:'Editar Sequência ativa fixture',exact:true}).getAttribute('href'),'/m/sequences?edit=seq2&returnTo=%2Fm%2Fpipeline')
 assert.equal(await page.getByRole('link',{name:'Editar Sequência certa',exact:true}).count(),0)
 await page.getByRole('link',{name:'Editar Sequência ativa fixture',exact:true}).waitFor()
 await page.keyboard.press('Escape')
 assert.equal(await page.locator('details').first().getAttribute('open'),null)
 await page.setViewportSize({width:1440,height:900})
 await page.screenshot({path:path.join(output,'desktop-strip.png'),fullPage:true})
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844})
  await summary.click()
  await page.screenshot({path:path.join(output,`mobile-${width}-details.png`),fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.keyboard.press('Escape')
 }
 mode='hold';await page.getByRole('button',{name:'Switch fixture'}).click()
 await page.getByText('Ações · Carregando…',{exact:true}).waitFor()
 mode='error';await page.getByRole('button',{name:'Switch fixture'}).click()
 await page.getByText('Ações · Indisponível',{exact:true}).waitFor()
 if(hold)await hold.fulfill({json:{pipeline_id:two,stages}})
 await page.waitForTimeout(100)
 assert.equal(await page.locator('summary').count(),0)
 mode='restricted';await page.getByRole('button',{name:'Tentar novamente'}).click()
 await page.getByText('Somente o dono da conta pode consultar e editar estas ações.').waitFor()
 assert.equal(await page.getByRole('link').count(),0)
 mode='ready';await page.getByRole('button',{name:'Switch fixture'}).click()
 await summary.filter({hasText:'2 ativas'}).waitFor()
 await page.goto(base+'/m/pipeline')
 await summary.filter({hasText:'2 ativas'}).waitFor()
 const mobileStrip=await page.locator('[aria-label="Ações de Novo lead"]').boundingBox()
 const mobileTitle=await page.locator('.m-chip.on').boundingBox()
 assert.ok(mobileStrip.y+mobileStrip.height<=mobileTitle.y,'mobile active badges above selected stage title')
 await summary.click()
 await page.getByRole('link',{name:'Editar Sequência ativa fixture',exact:true}).waitFor()
 assert.equal(await page.locator('.m-root').evaluate(el=>getComputedStyle(el).getPropertyValue('--m-bg').trim()),'#0b0b12')
 await page.screenshot({path:path.join(output,'mobile-native-details.png'),fullPage:true})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await page.locator('.m-chip').filter({hasText:'Sem ações'}).click()
 assert.equal(await page.locator('[aria-label^="Ações de"]').count(),0)
 assert.equal(await page.locator('summary').count(),0)
 assert.equal(await page.getByRole('link',{name:/Editar/}).count(),0)
 const emptyY=(await page.locator('.m-chip.on').boundingBox()).y
 await page.locator('.m-chip').filter({hasText:'Só inativas'}).click()
 assert.equal(await page.locator('[aria-label^="Ações de"]').count(),0)
 assert.equal((await page.locator('.m-chip.on').boundingBox()).y,emptyY,'inactive and empty stages reserve no indicator gap')
 assert.ok(mobileTitle.y>emptyY,'empty stage reclaims active strip height')
 await page.screenshot({path:path.join(output,'mobile-empty.png'),fullPage:true})
 stages.find(s=>s.id==='stage').sequences.push(...Array.from({length:15},(_,i)=>({...activeSeq,id:`long-${i}`,name:'Nome muito longo '.repeat(8)})))
 await page.goto(base+'/board')
 await summary.filter({hasText:'17 ativas'}).waitFor();await summary.click()
 const list=page.locator('details[open] ul')
 assert.ok(await list.evaluate(el=>el.scrollHeight>el.clientHeight),'long action lists must scroll inside a contained panel')
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 // Agency's actual page receives the legitimate virtual board. It must not request UUID metadata.
 await page.context().addCookies([{name:'sb-fixture-auth-token',value:encodeURIComponent(Buffer.from(JSON.stringify({access_token:'fixture.'+Buffer.from(JSON.stringify({sub:'fixture-user'})).toString('base64')+'.fixture'})).toString('base64')),url:base}])
 await page.setViewportSize({width:1440,height:900})
 await page.goto(base+'/dashboard/pipeline')
 await page.locator('summary').filter({hasText:'17 ativas'}).waitFor()
 for (const name of ['Sem ações','Só inativas']) {
  const title=page.getByRole('heading',{name,exact:true})
  const header=title.locator('../../..')
  assert.equal(await header.locator('details,[role=status],[aria-label^="Ações de"]').count(),0)
  const metrics=await header.evaluate(el=>({top:el.getBoundingClientRect().top,padding:parseFloat(getComputedStyle(el).paddingTop),first:el.firstElementChild.getBoundingClientRect().top}))
  assert.equal(metrics.first,metrics.top+metrics.padding,'empty/inactive desktop header has no reserved action gap')
 }
 const ownActions=page.locator('[aria-label="Ações de Novo lead"]')
 const ownTitle=page.getByRole('heading',{name:'Novo lead',exact:true})
 assert.ok((await ownActions.boundingBox()).y+(await ownActions.boundingBox()).height<=(await ownTitle.boundingBox()).y)
 await ownActions.locator('summary').first().click()
 const ownHref=await page.getByRole('link',{name:'Editar Sequência ativa fixture',exact:true}).getAttribute('href')
 assert.equal(new URL(ownHref,base).pathname,'/dashboard/sequences')
 assert.equal(new URL(ownHref,base).searchParams.get('edit'),'seq2')
 assert.equal(new URL(ownHref,base).searchParams.get('returnTo'),`/dashboard/pipeline?pipeline=${one}`)
 await page.screenshot({path:path.join(output,'desktop-personal-active-empty-inactive.png'),fullPage:true})
 await page.getByRole('button',{name:/Time|Team|Equipe/}).click()
 await page.getByText('Ações · Não se aplica',{exact:true}).waitFor()
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
   await page.locator('[aria-label="Ações de Novo lead"]').waitFor()
   const stripBox=await page.locator('[aria-label="Ações de Novo lead"]').boundingBox()
   assert.ok(stripBox.y+stripBox.height<=(await page.locator('.m-chip.on').boundingBox()).y)
   await page.locator('summary').filter({hasText:kind==='sequences'?'Sequência ·':'Automação ·'}).click()
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
 console.log(JSON.stringify({result:'PASS',writes,external,pseudoRequests,metadataRequests,output}))
} finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
