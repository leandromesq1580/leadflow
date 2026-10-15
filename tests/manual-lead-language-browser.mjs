import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import {createRequire} from 'node:module'
const repo=process.cwd(),out=process.env.UI_RESULTS_DIR
assert.ok(out?.includes('/scratch/'))
await mkdir(out,{recursive:true})
const require=createRequire(path.join(repo,'package.json'))
const {build}=require('esbuild')
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE)
const mocks={
 'next/navigation': 'export const useRouter=()=>({refresh:()=>{window.refreshed=(window.refreshed||0)+1}})',
 '@/lib/i18n-client': 'export const useT=()=>({_locale:window.fixtureLocale||"pt"})',
}
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {LeadActions} from './src/app/dashboard/leads/lead-actions';createRoot(document.getElementById('root')).render(<LeadActions/>);`,resolveDir:repo,loader:'tsx'},bundle:true,outfile:path.join(out,'ui.js'),platform:'browser',jsx:'automatic',alias:{'@':path.join(repo,'src')},plugins:[{name:'fixture-auth-free',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}))}}]})
const css=await require('postcss')([require('@tailwindcss/postcss')()]).process(await readFile('src/app/globals.css','utf8'),{from:path.join(repo,'src/app/globals.css')})
await writeFile(path.join(out,'ui.css'),css.css)
const server=http.createServer(async(req,res)=>{const file=req.url==='/ui.js'?'ui.js':req.url==='/ui.css'?'ui.css':null;if(file){res.setHeader('Content-Type',file.endsWith('js')?'text/javascript':'text/css');res.end(await readFile(path.join(out,file)))}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/ui.css"></head><body><div id="root"></div><script src="/ui.js"></script></body></html>')}})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const base=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({headless:true})
const results=[]
try {
 for(const width of [1280,390]) for(const [ui,locale,add,field] of [['pt','es','Adicionar','Idioma do lead'],['en','pt','Add','Lead language'],['es','en','Agregar','Idioma del lead']]) {
  const page=await browser.newPage({viewport:{width,height:900}})
  page.setDefaultTimeout(4000)
  const writes=[],errors=[]
  await page.addInitScript(ui=>{window.fixtureLocale=ui},ui)
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url())
   if(u.origin!==base) throw new Error('External request disallowed')
   if(u.pathname==='/api/leads/manual') {writes.push(req.postDataJSON());return route.fulfill({json:{lead:{id:'synthetic',...writes.at(-1)}}})}
   return route.continue()
  })
  await page.goto(base)
  await page.getByRole('button',{name:new RegExp(`\\+ ${add} Lead`)}).click()
  await page.locator('input').first().fill('Lead de demonstração')
  await page.locator('input[type="email"]').fill('demo@example.invalid')
  const select=page.getByLabel(field,{exact:false})
  await select.waitFor()
  assert.equal(await select.inputValue(),'')
  const options=await select.locator('option').allTextContents()
  for(const label of ['🇧🇷 Português','🇺🇸 English','🇪🇸 Español'])assert.ok(options.includes(label))
  await page.getByRole('button',{name:add,exact:true}).click()
  assert.equal(writes.length,0,'Missing language must not submit')
  await select.selectOption(locale)
  assert.equal(await select.inputValue(),locale)
  assert.equal(await page.getByText({pt:'Selecione o idioma do lead.',en:'Select the lead language.',es:'Selecciona el idioma del lead.'}[ui],{exact:false}).count(),0)
  await page.screenshot({path:path.join(out,`lead-language-${width}-${ui}.png`),fullPage:true})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal overflow')
  await page.getByRole('button',{name:add,exact:true}).click()
  await page.waitForFunction(()=>window.refreshed===1)
  assert.equal(writes.length,1)
  assert.equal(writes[0].lead_language,locale)
  assert.equal(await page.evaluate(()=>window.fixtureLocale),ui,'Contact selection must not change UI locale')
  assert.deepEqual(errors,[])
  results.push({width,ui,lead_language:locale,posted:writes.length,passed:true})
  await page.close()
 }
}finally{await browser.close();await new Promise(r=>server.close(r));await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2))}
console.log(JSON.stringify({passed:results.length,results},null,2))
