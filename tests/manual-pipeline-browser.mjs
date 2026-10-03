// Offline Chromium fixture of the real component; no production/env access.
import assert from 'node:assert/strict'
import {mkdtemp,readFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const native=createRequire(import.meta.url)
async function serverModule(entry){const {outputFiles}=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',packages:'external'});const m={exports:{}};new Function('require','module','exports',outputFiles[0].text)(native,m,m.exports);return m.exports}
const {proxy}=await serverModule('src/proxy.ts')
const {fixtureLayout}=await serverModule('tests/helpers/pipeline-layout-fixture.ts')
const {NextRequest}=native('next/server')
const mobileCSS=(await readFile('src/app/m/m-theme.css','utf8')).replace(/^@import.*$/gm,'')
const out=await mkdtemp(path.join(process.env.TMPDIR,'manual-entry-ui-'))
console.log('Evidence:',out)
const component='src/components/add-existing-lead-to-pipeline.tsx'
await build({entryPoints:['tests/manual-pipeline-browser-entry.tsx'],bundle:true,outfile:path.join(out,'app.js'),platform:'browser',jsx:'automatic',alias:{'@':path.resolve('src')},plugins:[{name:'offline-navigation',setup(b){b.onResolve({filter:/^(next\/navigation|.*i18n-client)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('navigation')?`export const useParams=()=>({id:'00000000-0000-4000-8000-000000000002'});export const useRouter=()=>({back(){}});`:`export const useT=()=>({_locale:'pt'});`}))}},...(existsSync(component)?[]:[{name:'red-no-feature',setup(b){b.onResolve({filter:/add-existing-lead-to-pipeline$/},()=>({path:'missing',namespace:'red'}));b.onLoad({filter:/.*/,namespace:'red'},()=>({contents:'export const AddExistingLeadToPipeline = () => null'}))}}])]})
const server=http.createServer(async(req,res)=>{
 if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(path.join(out,'app.js')));return}
 const response=proxy(new NextRequest(`http://${req.headers.host}${req.url}`,{headers:req.headers}))
 if(response.headers.has('location')){res.writeHead(response.status,{location:response.headers.get('location')});res.end();return}
 let root='<div id="root"></div>'
 if(req.url.startsWith('/m/'))root=renderToStaticMarkup(await fixtureLayout('m',req.headers['user-agent']||'',false)({children:React.createElement('div',{id:'root'})}))
 res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${mobileCSS}</style><body style="margin:16px;font:16px Arial">${root}<script src="/app.js"></script></body></html>`)
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);const browser=await chromium.launch({headless:true})
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:850},...(width===390?{userAgent:'Lead4ProApp fixture'}:{})});page.setDefaultTimeout(2500)
  let writes=0,mode='fail',external=0,release;const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==base){external++;return route.abort()}
   if(url.pathname.startsWith('/api/')){
    if(url.pathname===`/api/leads/${id(2)}`)return route.fulfill({json:{lead:{id:id(2),name:'Lead fixture',status:'assigned',activities:[]}}})
    if(url.pathname==='/api/m/team-context')return route.fulfill({json:{buyer_id:id(1),members:[]}})
    if(url.pathname.endsWith('/tags'))return route.fulfill({json:{tags:[]}})
    if(url.pathname.endsWith('/follow-ups'))return route.fulfill({json:{followUps:[]}})
    assert.equal(url.pathname,`/api/leads/${id(2)}/pipeline-entry`)
    if(req.method()==='GET')return route.fulfill({json:{eligible:mode!=='existing',pipelines:[{id:id(3),name:'Funil fixture',stages:[{id:id(4),name:'Contato'}]},{id:id(5),name:'Sem estágio',stages:[]}]}})
    writes++;assert.deepEqual(req.postDataJSON(),{pipeline_id:id(3),stage_id:id(4)})
    if(mode==='fail')return route.fulfill({status:409,json:{error:'Já existe um cartão fixture.'}})
    if(mode==='network')return route.abort()
    if(mode==='invalid')return route.fulfill({json:{success:true}})
    await new Promise(resolve=>{release=resolve})
    return route.fulfill({json:{success:true,changed:true,silent:true,entry:{id:id(9),lead_id:id(2),pipeline_id:id(3),stage_id:id(4)}}})
   }return route.continue()
  })
  await page.goto(base+(width===390?`/m/leads/${id(2)}`:'/'));await page.getByRole('button',{name:'Adicionar ao funil',exact:true}).click()
  await page.getByLabel('Funil', {exact:true}).selectOption(id(3));await page.getByLabel('Estágio', {exact:true}).selectOption(id(4))
  await page.screenshot({path:path.join(out,`form-${width}.png`),fullPage:true})
  if(width===390)assert.notEqual(await page.getByLabel('Funil',{exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)','mobile controls must not be white on white')
  const submit=page.getByRole('button',{name:'Confirmar inclusão',exact:true});await submit.click();await page.getByRole('alert').filter({hasText:'Já existe'}).waitFor()
  assert.equal(await page.getByLabel('Funil',{exact:true}).inputValue(),id(3));assert.equal(await page.getByLabel('Estágio',{exact:true}).inputValue(),id(4))
  mode='network';await submit.click();await page.getByRole('alert').filter({hasText:'conexão'}).waitFor()
  mode='invalid';await submit.click();await page.getByRole('alert').filter({hasText:'confirmar'}).waitFor();assert.equal(await page.getByRole('status').count(),0)
  mode='hold';await submit.evaluate(el=>{el.click();el.click()});await page.waitForFunction(()=>document.querySelector('button[disabled]')!==null)
  assert.equal(writes,4);assert.equal(await submit.isDisabled(),true);assert.equal(await page.getByLabel('Funil',{exact:true}).isDisabled(),true)
  release();await page.getByRole('status').filter({hasText:'Lead incluído'}).waitFor();assert.equal(await submit.count(),0)
  await page.screenshot({path:path.join(out,`success-${width}.png`),fullPage:true})
  mode='existing';await page.reload();await page.getByText('Lead já está em um funil.').waitFor();assert.equal(await page.getByRole('button',{name:'Adicionar ao funil',exact:true}).count(),0)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(external,0);assert.deepEqual(errors,[])
  console.log(`PASS ${width}px: conflict/network/invalid response, preserved selection, duplicate click, success, existing card; external=${external}`);await page.close()
 }
}finally{await browser.close();await new Promise(r=>server.close(r))}
