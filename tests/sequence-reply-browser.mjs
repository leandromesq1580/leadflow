// Local-only real React page harness. Network is blocked except this fixture server.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/sequence-reply-browser.mjs
import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const root = process.cwd()
const output = await mkdtemp(path.join(process.env.TMPDIR || '/home/hermes/.hermes/profiles/lead4pro/cache/scratch', 'sequence-reply-ui-'))
console.log('Evidence:', output)
await build({ entryPoints: ['tests/sequence-reply-browser-entry.tsx'], bundle: true, outfile: path.join(output, 'app.js'), platform: 'browser', jsx: 'automatic', alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"development"' } })
const css = await postcss([tailwind({ base: root })]).process(await readFile('src/app/globals.css', 'utf8'), { from: path.join(root, 'src/app/globals.css') })
await writeFile(path.join(output, 'app.css'), css.css)
const fontCSS = '@font-face{font-family:GeistFixture;src:url(/geist.woff2) format("woff2");font-weight:100 900;font-display:swap}'
const html = '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>' + fontCSS + '</style></head><body style="font-family:GeistFixture,Arial,sans-serif"><div id="root"></div><script src="/app.js"></script></body></html>'
const server = http.createServer(async (req, res) => {
  if (req.url === '/geist.woff2') { res.setHeader('Content-Type', 'font/woff2'); res.end(await readFile(path.join(root, 'src/fonts/geist-latin.woff2'))); return }
  if (req.url === '/app.js' || req.url === '/app.css') { res.setHeader('Content-Type', req.url.endsWith('css') ? 'text/css' : 'text/javascript'); res.end(await readFile(path.join(output, req.url.slice(1)))) }
  else { res.setHeader('Content-Type', 'text/html'); res.end(html) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true })
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}})
 page.setDefaultTimeout(3000)
 const posts=[];let fail=false,external=0
 const pipelines=[{id:'p',name:'Pipeline',stages:[{id:'follow',pipeline_id:'p',name:'Follow-up',position:0},{id:'reply',pipeline_id:'p',name:'Respondeu',position:1}]},{id:'p2',name:'Other',stages:[{id:'other',pipeline_id:'p2',name:'Other stage',position:0}]}]
 const sequences=[{id:'legacy',name:'Legacy',description:null,enabled:true,mode:'legacy',trigger_stage_id:'follow',reply_stage_id:'reply',sequence_steps:[{delay_hours:0,step_type:'wait',template_id:null,custom_body:null}]},{id:'ai',name:'AI missing destination',description:null,enabled:false,mode:'ai_until_reply',reply_stage_id:'deleted',sequence_steps:[]}]
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin!==`http://127.0.0.1:${server.address().port}`){external++;return route.abort()}
  if(url.pathname.startsWith('/api/sequences')){
   if(req.method()==='GET')return route.fulfill({json:{buyer_id:'buyer',sequences,pipelines,templates:[]}})
   posts.push({method:req.method(),url:url.pathname,...req.postDataJSON()})
   return route.fulfill(fail?{status:503,json:{error:'Fixture save failed'}}:{json:{sequence:{id:'fixture'}}})
  }
  return route.continue()
 })
 const base=`http://127.0.0.1:${server.address().port}`
 await page.goto(base)
 await page.getByRole('button',{name:'+ Nova sequência',exact:true}).click()
 const toggle=()=>page.getByRole('switch',{name:'Ao responder, mover para…'})
 assert.equal(await toggle().isChecked(),false)
 assert.equal(await page.locator('#sequence-reply-stage').count(),0)
 await page.getByLabel('Nome da sequência',{exact:true}).fill('Reply draft')
 await toggle().check()
 assert.equal(await page.locator('#sequence-reply-stage').inputValue(),'')
 assert.equal(await page.getByRole('button',{name:'Criar sequência',exact:true}).isDisabled(),true)
 await page.locator('#sequence-reply-stage').selectOption('reply')
 await page.screenshot({path:path.join(output,'reply-desktop.png'),fullPage:true})
 fail=true
 await page.getByRole('button',{name:'Criar sequência',exact:true}).click()
 await page.getByRole('dialog').getByText('Fixture save failed',{exact:true}).waitFor()
 assert.equal(await page.locator('#sequence-reply-stage').inputValue(),'reply')
 assert.equal(await page.getByLabel('Nome da sequência',{exact:true}).inputValue(),'Reply draft')
 assert.equal(posts.at(-1).reply_stage_id,'reply')
 fail=false
 await toggle().uncheck()
 await page.getByRole('button',{name:'Criar sequência',exact:true}).click()
 await page.getByRole('dialog').waitFor({state:'detached'})
 assert.equal(posts.at(-1).reply_stage_id,null)
 // Editing preserves configured destination; changing trigger invalidates incompatible target visibly.
 await page.getByRole('button',{name:'Editar',exact:true}).first().click()
 assert.equal(await toggle().isChecked(),true)
 assert.equal(await page.locator('#sequence-reply-stage').inputValue(),'reply')
 await page.getByText('Inscrição e descrição',{exact:false}).click()
 await page.locator('#sequence-trigger-stage').selectOption('other')
 assert.equal(await page.locator('#sequence-reply-stage').inputValue(),'')
 assert.equal(await page.getByRole('button',{name:'Salvar alterações',exact:true}).isDisabled(),true)
 await page.locator('#sequence-reply-stage').selectOption('other')
 await page.getByRole('button',{name:'Salvar alterações',exact:true}).click()
 await page.getByRole('dialog').waitFor({state:'detached'})
 assert.equal(posts.at(-1).method,'PATCH');assert.equal(posts.at(-1).reply_stage_id,'other');assert.equal(posts.at(-1).trigger_stage_id,'other')
 await page.setViewportSize({width:390,height:844})
 await page.getByRole('button',{name:'Duplicar',exact:true}).first().click()
 assert.equal(await page.locator('#sequence-reply-stage').inputValue(),'reply')
 await toggle().uncheck()
 assert.equal(await page.locator('#sequence-reply-stage').count(),0)
 await toggle().check()
 assert.equal(await page.locator('#sequence-reply-stage').inputValue(),'reply')
 await page.locator('#sequence-reply-stage').scrollIntoViewIfNeeded()
 await page.screenshot({path:path.join(output,'reply-mobile.png'),fullPage:true})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await page.getByRole('button',{name:'Criar sequência',exact:true}).click()
 await page.getByRole('dialog').waitFor({state:'detached'})
 assert.equal(posts.at(-1).enabled,false);assert.equal(posts.at(-1).reply_stage_id,'reply')
 // Missing destination is not silently changed to OFF nor another option.
 await page.getByRole('button',{name:'Editar',exact:true}).nth(1).click()
 assert.equal(await toggle().isChecked(),true)
 assert.equal(await page.locator('#sequence-reply-stage').inputValue(),'')
 assert.equal(await page.getByRole('button',{name:'Salvar alterações',exact:true}).isDisabled(),true)
 await page.locator('#sequence-reply-stage').selectOption('reply')
 await page.screenshot({path:path.join(output,'reply-ai-mobile.png'),fullPage:true})
 await page.getByRole('button',{name:'Salvar alterações',exact:true}).click()
 await page.getByRole('dialog').waitFor({state:'detached'})
 assert.equal(posts.at(-1).mode,'ai_until_reply');assert.equal(posts.at(-1).reply_stage_id,'reply')
 for(const [locale,label,create] of [['en','On reply, move to…','+ New sequence'],['es','Al responder, mover a…','+ Nueva secuencia']]){
  await page.goto(base+'?locale='+locale)
  await page.getByRole('button',{name:create,exact:true}).click()
  await page.getByRole('switch',{name:label}).check()
  assert.equal(await page.locator('#sequence-reply-stage').inputValue(),'')
  await page.screenshot({path:path.join(output,'reply-'+locale+'.png'),fullPage:true})
 }
 assert.equal(external,0)
 await writeFile(path.join(output,'payloads.json'),JSON.stringify(posts,null,2))
 console.log(JSON.stringify({result:'PASS',posts:posts.length,external,output}))
} finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
