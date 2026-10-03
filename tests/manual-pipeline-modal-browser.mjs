import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import {createRequire} from 'node:module';
const repo=process.cwd(),out=process.env.UI_RESULTS_DIR;assert.ok(out?.includes('/scratch/'));const require=createRequire(path.join(repo,'package.json'));const {build}=require('esbuild');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const mocks={
 '@/components/send-message-modal':'export const SendMessageModal=()=>null',
 './exchange-box':'export const ExchangeBox=()=>null', '@/components/tag-picker':'export const TagPicker=()=>null',
 '@/components/whatsapp-inbox':'export const WhatsAppInbox=()=>null','@/components/voice/softphone':'export const callLead=()=>{}',
 '@/components/ai-score-badge':'export const AiScoreBadge=()=>null','@/components/time-picker':'export const TimePicker=()=>null',
 '@/lib/privacy-mode':'export const usePrivacy=()=>({enabled:false,mask:v=>v})','./lead-forms-tab':'export const LeadFormsTab=()=>null',
 '@/lib/i18n-client':'export const useT=()=>({_locale:window.fixtureLocale||"pt"})', '@/components/lead-language-badge':'export const LeadLanguageBadge=()=>null',
 '@/lib/lead-message-locale':'export const leadMessageLocale=()=>"pt"'};
await build({entryPoints:[path.join(repo,'tests/manual-pipeline-modal-entry.tsx')],bundle:true,outfile:path.join(out,'ui.js'),platform:'browser',jsx:'automatic',alias:{'@':path.join(repo,'src')},nodePaths:[path.join(repo,'node_modules')],plugins:[{name:'fixture-only-unrelated-modal-imports',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}))}}]});
const server=http.createServer(async(req,res)=>{if(req.url==='/ui.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(path.join(out,'ui.js')))}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><div id="root"></div><script src="/ui.js"></script></body></html>')}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const browser=await chromium.launch({headless:true});const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const results={};
const failures=[]
try {
 async function fixture(url,mode,width){
  const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(2500)
  let gets=0,pipeReads=0,posts=0,external=0,committed=false;const errors=[],writes=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url())
   if(u.origin!==base){external++;return route.abort()}
   if(!u.pathname.startsWith('/api/'))return route.continue()
   if(req.method()!=='GET')writes.push(req.method()+' '+u.pathname)
   if(u.pathname.endsWith('/pipeline-entry')){
    if(req.method()==='GET'){
     gets++
     if([401,403,404].includes(mode))return route.fulfill({status:mode,body:'non-JSON denial'})
     if(mode==='get-transient'&&gets===1)return route.fulfill({status:503,json:{error:'Indisponível'}})
     return route.fulfill({json:{eligible:true,pipelines:[{id:id(3),name:'Funil A',stages:[{id:id(4),name:'Etapa A'}]}]}})
    }
    posts++
    if(mode==='post-transient'&&posts===1)return route.fulfill({status:503,json:{error:'Indisponível'}})
    committed=true
    return route.fulfill({json:{success:true,changed:true,silent:true,entry:{id:id(9),lead_id:id(2),pipeline_id:id(3),stage_id:id(4)}}})
   }
   if(u.pathname==='/api/pipelines')return route.fulfill({json:{pipelines:[{id:id(3),name:'Funil A',stages:[{id:id(4),name:'Etapa A'}]}]}})
   if(u.pathname.endsWith('/pipeline')){
    pipeReads++
    if(committed&&mode==='refresh-http')return route.fulfill({status:503,json:{error:'Refresh failed'}})
    if(committed&&mode==='refresh-network')return route.abort()
    return route.fulfill({json:{pipelineLead:committed?{id:id(9),stage_id:id(4),pipeline:{id:id(3),name:'Funil A'},stage:{name:'Etapa A'}}:null}})
   }
   if(u.pathname.endsWith('/follow-ups'))return route.fulfill({json:{followUps:[]}})
   if(u.pathname.endsWith('/attachments'))return route.fulfill({json:{attachments:[]}})
   return route.fulfill({json:{lead:{id:id(2),name:'Lead sintético',phone:'',activities:[]}}})
  })
  await page.goto(base+url)
  return {page,counts:()=>({gets,pipeReads,posts,external,errors,writes})}
 }
 async function add(page){await page.getByRole('button',{name:'Adicionar ao funil',exact:true}).click();await page.getByLabel('Funil',{exact:true}).selectOption(id(3));await page.getByLabel('Estágio',{exact:true}).selectOption(id(4));await page.getByRole('button',{name:'Confirmar inclusão',exact:true}).click()}
 async function test(name,run){try{await run();console.log('PASS',name)}catch(e){failures.push({name,error:e.message});console.log('FAIL',name,e.message)}}
 for(const width of [1440,390]){
  if(process.env.CASE!=='L3')for(const status of [403,401,404])await test(`${width} terminal ${status}`,async()=>{
   const f=await fixture('/',status,width)
   try{
    await f.page.getByRole('alert').waitFor()
    results[`${width}-${status}`]={...f.counts(),text:await f.page.getByRole('alert').innerText(),retries:await f.page.getByRole('button',{name:'Tentar novamente'}).count()}
    assert.equal(results[`${width}-${status}`].retries,0)
    assert.match(results[`${width}-${status}`].text,status===403?/permissão/i:status===401?/sessão/i:/indisponível/i)
    assert.equal(f.counts().posts,0);assert.equal(f.counts().gets,1)
    await f.page.screenshot({path:path.join(out,`terminal-${status}-${width}.png`)})
   }finally{await f.page.close()}
  })
  if(process.env.CASE!=='L2')for(const mode of ['success','refresh-http','refresh-network'])await test(`${width} modal ${mode}`,async()=>{
   const f=await fixture('/modal',mode,width)
   try{
    await add(f.page)
    await f.page.waitForFunction(()=>window.saved===1)
    await f.page.getByText('Funil atual:',{exact:true}).waitFor()
    assert.equal(await f.page.locator('select').filter({has:f.page.locator(`option[value="${id(4)}"]`)}).inputValue(),id(4))
    assert.equal(await f.page.getByRole('button',{name:'Confirmar inclusão'}).count(),0)
    assert.equal(await f.page.getByRole('button',{name:'Tentar novamente'}).count(),0)
    if(mode!=='success')await f.page.getByRole('status').filter({hasText:'incluído'}).waitFor()
    results[`${width}-${mode}`]={...f.counts(),saved:await f.page.evaluate(()=>window.saved),currentPipelineVisible:await f.page.getByText('Funil atual:',{exact:true}).count(),stageVisible:await f.page.getByText('Etapa A',{exact:true}).first().isVisible()}
    assert.equal(f.counts().posts,1);assert.equal(f.counts().pipeReads,2);assert.equal(f.counts().writes.length,1);assert.equal(f.counts().external,0);assert.deepEqual(f.counts().errors,[])
    await f.page.screenshot({path:path.join(out,`modal-${mode}-${width}.png`)})
   }finally{await f.page.close()}
  })
  if(!process.env.CASE)for(const mode of ['get-transient','post-transient'])await test(`${width} ${mode}`,async()=>{
   const f=await fixture('/',mode,width)
   try{
    if(mode==='get-transient'){await f.page.getByRole('alert').waitFor();await f.page.getByRole('button',{name:'Tentar novamente'}).click()}
    await add(f.page)
    if(mode==='post-transient'){
     await f.page.getByRole('alert').waitFor()
     assert.equal(await f.page.getByLabel('Funil',{exact:true}).inputValue(),id(3));assert.equal(await f.page.getByLabel('Estágio',{exact:true}).inputValue(),id(4))
     await f.page.getByRole('button',{name:'Confirmar inclusão'}).click()
    }
    await f.page.getByRole('status').filter({hasText:'Lead incluído'}).waitFor()
    results[`${width}-${mode}`]=f.counts();assert.equal(f.counts().external,0)
   }finally{await f.page.close()}
  })
 }
}finally{await browser.close();await new Promise(r=>server.close(r));await writeFile(path.join(out,'ui-results.json'),JSON.stringify({results,failures},null,2))}
assert.deepEqual(failures,[])
