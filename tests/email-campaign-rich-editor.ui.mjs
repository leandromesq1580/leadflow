// Actual Chromium clipboard and selection; React editor; loopback only, no API/provider.
import {createRequire} from 'node:module'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'node:http'
import assert from 'node:assert/strict'
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=process.env.EC_TEST_OUTPUT
assert.ok(out);mkdirSync(out,{recursive:true})
const {chromium}=createRequire(resolve(process.env.EC_TEST_TOOL_DIR,'package.json'))('playwright'),esbuild=createRequire(resolve(repo,'package.json'))('esbuild')
const url='https://example.invalid/quote?lang=pt&source=email&text=cotacao(test)'
const bundle=await esbuild.build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import Editor from'${repo}/src/components/admin/CampaignBodyEditor.tsx';import{encodeCampaignHtml,campaignBodyToText}from'${repo}/src/lib/email-campaign-rich.ts';window.text=campaignBodyToText;const bodies={clipboard:encodeCampaignHtml('<strong>Seguro</strong> <a href="${url}">Pedir cotação</a>'),limit:encodeCampaignHtml(Array.from({length:90},(_,i)=>'<a href="https://example.invalid/q'+i+'">Link '+i+'</a>').join('')),overflow:encodeCampaignHtml('<p>Existing</p>')};function App(){return Object.entries(bodies).map(([key,body])=><Item key={key} name={key} initial={body}/>)}function Item({name,initial}){const[value,setValue]=useState(initial);return <section><Editor value={value} onChange={setValue} disabled={false} language="pt" label={name}/><output data-testid={name+'-value'}>{value}</output></section>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:repo,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfig:resolve(repo,'tsconfig.json')})
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script></html>')})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({headless:true,executablePath:process.env.EC_TEST_CHROME,args:['--no-sandbox']}),checks=[],errors=[],external=[]
try{
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():(external.push(r.request().url()),r.abort()));const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin)
 for(const name of ['clipboard','limit','overflow'].filter(x=>!process.env.EC_TEST_CASE||x===process.env.EC_TEST_CASE)){
  const editor=page.getByLabel(name,{exact:true}),output=page.getByTestId(name+'-value');await editor.focus()
  if(name==='clipboard'){
   const before=await output.innerText();await editor.press('Control+a');await editor.press('Control+x');await editor.press('Control+v')
   assert.equal(await editor.getByRole('link',{name:'Pedir cotação'}).getAttribute('href'),url,'Copy/cut/paste must preserve href literally, including legitimate closing parenthesis')
   assert.equal(await editor.locator('strong').innerText(),'Seguro');assert.equal(await output.innerText(),before)
   await editor.press('Control+z');assert.equal(await editor.locator('a').count(),0,'Undo paste');await editor.press('Control+z');assert.equal(await editor.getByRole('link',{name:'Pedir cotação'}).getAttribute('href'),url,'Undo cut restores link')
  }
  if(name==='limit'){
   await editor.press('Control+a');await page.evaluate(()=>navigator.clipboard.writeText('x'.repeat(10000)));await editor.press('Control+v')
   assert.equal(await output.evaluate(e=>window.text(e.textContent)),'x'.repeat(10000),'Replacing selected HTML must measure final document, not removed tags')
   assert.ok((await output.innerText()).length<20000)
  }
  if(name==='overflow'){
   const before=await output.innerText();await editor.press('Control+End');await page.evaluate(()=>navigator.clipboard.writeText('x'.repeat(20001)));await editor.press('Control+v')
   assert.equal(await output.innerText(),before);assert.match(await editor.locator('..').getByRole('alert').innerText(),/20.000/,'Rejected paste is explained, not silent')
  }
  checks.push({name,passed:true});console.log('PASS',name)
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[])
}finally{await browser.close();await new Promise(r=>server.close(r));writeFileSync(resolve(out,'rich-native-report.json'),JSON.stringify({checked_at:new Date().toISOString(),checks,errors,external},null,2),{flag:'wx'})}
