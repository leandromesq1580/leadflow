// Local-only real React page harness. Network is blocked except this fixture server.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/ai-sequence-browser.mjs
import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const root = process.cwd()
const output = await mkdtemp(path.join(process.env.TMPDIR || '/home/hermes/.hermes/profiles/lead4pro/cache/scratch', 'ai-instructions-ui-'))
console.log('Evidence:', output)
await build({ entryPoints: ['tests/ai-sequence-browser-entry.tsx'], bundle: true, outfile: path.join(output, 'app.js'), platform: 'browser', jsx: 'automatic', alias: { '@': path.join(root, 'src') }, define: { 'process.env.NODE_ENV': '"development"' } })
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
 const page = await browser.newPage({viewport:{width:1440,height:1000}})
 page.setDefaultTimeout(2500)
 let posts=[], fail=false, reloadFail=false, external=0
 const ai={model:'gpt-6-astra',goal:'meeting',brief:'Proteção familiar',instructions:'Tom acolhedor.',presentation:'Sou Ana.',initial_delay_minutes:17,repeat_minutes:1501,timezone:'America/New_York',days:[1,3,5],start:'09:17',end:'18:23',stop_on_stage_exit:true,booking_url:'https://example.com/book'}
 const original=[{id:'ai',name:'AI original',description:'Descrição',enabled:true,mode:'ai_until_reply',ai_config:ai,trigger_stage_id:'stage',sequence_steps:[]},{id:'legacy',name:'Legacy original',description:'Etapas',enabled:true,mode:'legacy',sequence_steps:[{id:'s1',delay_hours:0,step_type:'send_template',template_id:null,custom_body:'Olá'},{id:'s2',delay_hours:12,step_type:'wait',template_id:null,custom_body:null},{id:'s3',delay_hours:24,step_type:'notify_agent',template_id:null,custom_body:'Avisar'}]}]
 const snapshot=structuredClone(original)
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin!==`http://127.0.0.1:${server.address().port}`){external++;return route.abort()}
  if(url.pathname==='/api/sequences'){
   if(req.method()==='POST'){posts.push(req.postDataJSON());await new Promise(r=>setTimeout(r,200));return route.fulfill(fail?{status:503,json:{error:'Falha fixture'}}:{json:{sequence:{id:'copy'}}})}
   assert.equal(req.method(),'GET')
   return route.fulfill(reloadFail?{status:503,json:{error:'Reload fixture'}}:{json:{buyer_id:'buyer',sequences:original,templates:[],pipelines:[{id:'p',name:'Pipeline',stages:[{id:'stage',name:'Stage',position:0}]}]}})
  }
  if(url.pathname.startsWith('/api/'))throw Error('Unexpected API '+req.method()+' '+url.pathname)
  return route.continue()
 })
 await page.goto(`http://127.0.0.1:${server.address().port}`)
 await page.getByRole('button',{name:'Editar',exact:true}).first().waitFor()
 assert.equal(await page.getByRole('button',{name:'Duplicar',exact:true}).count(),2)
 await page.getByRole('button',{name:'Duplicar',exact:true}).first().click()
 await page.getByRole('heading',{name:'Duplicar sequência',exact:true}).waitFor()
 assert.equal(await page.getByLabel('Nome da sequência',{exact:true}).inputValue(),'AI original (cópia)')
 await page.getByText('A cópia será criada desativada, sem contatos inscritos.',{exact:true}).waitFor()
 await page.screenshot({path:path.join(output,'duplicate-desktop.png'),fullPage:true})
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(posts.length,0)
 await page.getByRole('button',{name:'Duplicar',exact:true}).first().click()
 await page.getByLabel('Nome da sequência',{exact:true}).fill('Minha cópia')
 fail=true
 await page.getByRole('button',{name:'Criar sequência',exact:true}).click()
 await page.getByRole('dialog').getByText('Falha fixture',{exact:true}).waitFor()
 assert.equal(await page.getByLabel('Nome da sequência',{exact:true}).inputValue(),'Minha cópia')
 assert.deepEqual(posts[0].ai_config,ai)
 assert.equal(posts[0].trigger_stage_id,'stage');assert.equal(posts[0].enabled,false);assert.equal(posts[0].id,undefined)
 fail=false;reloadFail=true
 await page.getByRole('button',{name:'Criar sequência',exact:true}).evaluate(el=>{el.click();el.click()})
 await page.getByRole('dialog').waitFor({state:'detached'})
 await page.getByText(/Salvo, mas não foi possível recarregar/).waitFor()
 assert.equal(posts.length,2)
 reloadFail=false
 await page.reload()
 await page.setViewportSize({width:390,height:844})
 await page.getByRole('button',{name:'Duplicar',exact:true}).nth(1).click()
 await page.screenshot({path:path.join(output,'duplicate-mobile.png'),fullPage:true})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await page.getByRole('button',{name:'Criar sequência',exact:true}).click()
 await page.getByRole('dialog').waitFor({state:'detached'})
 assert.equal(posts.length,3);assert.equal(posts[2].enabled,false)
 assert.deepEqual(posts[2].steps,original[1].sequence_steps.map(({id,...step})=>step))
 await page.screenshot({path:path.join(output,'duplicate-mobile-cards.png'),fullPage:true})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 assert.deepEqual(original,snapshot);assert.equal(external,0)
 console.log(JSON.stringify({result:'PASS',posts:posts.length,external,output}))
} finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
