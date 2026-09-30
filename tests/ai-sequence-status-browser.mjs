// Real component, synthetic read-only API fixtures; no external requests permitted.
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import {build} from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
const output=await mkdtemp(path.join(process.env.TMPDIR,'ai-status-browser-'))
await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{SequenceEnrollmentPanel}from'./src/components/sequence-enrollment-panel';createRoot(document.getElementById('root')).render(<SequenceEnrollmentPanel sequenceId='fixture' enabled={false}/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,outfile:path.join(output,'app.js'),platform:'browser',jsx:'automatic',alias:{'@':path.join(process.cwd(),'src')}})
const css=await postcss([tailwind({base:process.cwd()})]).process(await readFile('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')})
await writeFile(path.join(output,'app.css'),css.css)
const server=http.createServer(async(req,res)=>{if(['/app.js','/app.css'].includes(req.url)){res.setHeader('Content-Type',req.url.endsWith('js')?'text/javascript':'text/css');res.end(await readFile(path.join(output,req.url)))}else res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body><h1>Fixture local — status de execução</h1><div id="root"></div><script src="/app.js"></script></body></html>')})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE)
let browser
try{
 browser=await chromium.launch({headless:true})
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 let externalRequests=0;let mutations=0;const errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 const origin=`http://127.0.0.1:${server.address().port}`
 await page.route('**/*',route=>{
  const url=new URL(route.request().url())
  if(url.origin!==origin){externalRequests++;return route.abort()}
  if(url.pathname.startsWith('/api/')){
   if(route.request().method()!=='GET'){mutations++;return route.abort()}
   return route.fulfill({json:{enrollments:[['new','AI_INVALID_TEXT:goal','active',1,null],['old','generation_unavailable','active',1,null],['paused','delivery_unknown','paused',3,'2026-09-29T14:00:00Z']].map(([id,stop_reason,status,attempts,last_sent_at])=>({id,stop_reason,status,attempts,last_sent_at,current_step:0,next_run_at:'2026-09-29T15:05:00Z',generation_status:'failed',delivery_status:status==='paused'?'unknown':'idle',leads:{name:`Fixture ${id}`}}))}})
  }
  return route.continue()
 })
 await page.goto(origin)
 await page.getByText(/A pergunta final não corresponde ao objetivo/).waitFor()
 await page.getByText(/Falha de geração antiga, sem diagnóstico detalhado/).waitFor()
 assert.equal(await page.getByText('Nenhum envio confirmado',{exact:false}).count(),2)
 assert.ok((await page.locator('tbody').innerText()).includes('Tentativa: 1/3'))
 assert.ok(!(await page.locator('tbody tr').nth(2).innerText()).includes('11:05'))
 assert.ok((await page.locator('body').innerText()).includes('não garante envio'))
 await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true})
 await page.setViewportSize({width:390,height:844})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true})
 const scroller=page.locator('.overflow-x-auto')
 await scroller.evaluate(el=>{el.scrollLeft=el.scrollWidth})
 assert.ok(await scroller.evaluate(el=>el.scrollLeft>0),'table supports horizontal scroll on mobile')
 const lastCell=page.locator('tbody tr').first().locator('td').last()
 assert.ok(await lastCell.evaluate(el=>{const r=el.getBoundingClientRect();return r.right<=innerWidth && r.left>=0}),'action and next attempt reachable by horizontal scroll')
 await page.screenshot({path:path.join(output,'mobile-scrolled.png'),fullPage:true})
 assert.equal(externalRequests,0);assert.equal(mutations,0);assert.deepEqual(errors,[])
 console.log(JSON.stringify({result:'PASS',externalRequests,mutations,consoleErrors:errors.length,output}))
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
