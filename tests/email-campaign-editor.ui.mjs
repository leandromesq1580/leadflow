// Browser-native regressions for review findings L1-L4. Synthetic local page/API only.
import {createRequire} from 'node:module'
import {writeFileSync,mkdirSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'node:http'
import assert from 'node:assert/strict'
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=process.env.EC_TEST_OUTPUT
assert.ok(out,'Fresh evidence directory required');mkdirSync(out,{recursive:true})
const req=createRequire(resolve(process.env.EC_TEST_TOOL_DIR,'package.json')),{chromium}=req('playwright'),esbuild=createRequire(resolve(repo,'package.json'))('esbuild')
const link='https://wa.me/12025550123?text=Oi%20%26%20seguro',bodies={link:'Antes\n\n'+link+'\n\nDepois',undo:'Texto original',limit:'x'.repeat(19999),caret:'abcdef'}
const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from'${repo}/src/app/admin/email-campaigns/page.tsx';import{campaignBodyFromEditor}from'${repo}/src/lib/email-campaign-editor.ts';window.serialize=campaignBodyFromEditor;createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:repo,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfig:resolve(repo,'tsconfig.json')})
const server=createServer((_q,s)=>{s.setHeader('Content-Type','text/html');s.end(`<html><style>[contenteditable]{white-space:pre-wrap;min-height:100px}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`)})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({headless:true,executablePath:process.env.EC_TEST_CHROME,args:['--no-sandbox','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']})
const results=[],errors=[],external=[]
try{
 for(const [test,lang] of [['cut-paste','pt'],['cut-paste','es'],['cut-undo','pt'],['paste-undo','pt'],['typing-undo-blur','pt'],['replace-limit','pt'],['replace-partial-limit','pt'],['reject-limit','pt'],['caret-blur','pt']]){
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});let saved=null
  const initial=bodies[test.includes('limit')?'limit':test==='caret-blur'?'caret':test.includes('undo')?'undo':'link']
  await context.route('**/*',async route=>{const q=route.request(),u=new URL(q.url());if(u.origin!==origin){external.push(q.url());return route.abort()}if(!u.pathname.startsWith('/api/'))return route.continue()
   if(q.method()==='GET')return route.fulfill({json:{configuration:{ready:false,issues:['SYNTHETIC LOCAL NO SEND'],from:'synthetic@example.invalid',dailyLimit:200,domainVerified:false},buyers:[],campaigns:saved?[saved]:[],total_campaigns:saved?1:0,recipients:[],total_recipients:0}})
   if(u.pathname.endsWith('/generate'))return route.fulfill({json:{copy:{name:'Teste sintético',subject_pt:'Seguro de vida',subject_es:'Seguro de vida',body_pt:initial,body_es:initial}}})
   const body=q.postDataJSON();assert.equal(body.action,'save','Only draft persistence is allowed, no schedule/send');saved={...body.campaign,id:'00000000-0000-4000-8000-000000000111',state:'draft',stats:{},audience_snapshot:null};return route.fulfill({json:{campaign:saved}})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(origin);await page.getByRole('button',{name:'Nova campanha',exact:true}).click();await page.locator('summary').filter({hasText:'Gerar com IA'}).click();await page.getByRole('button',{name:'Gerar sugestões',exact:true}).click();await page.getByTestId('ai-subject').waitFor();await page.getByRole('button',{name:'Usar textos no rascunho',exact:true}).click();if(lang==='es')await page.getByRole('button',{name:'Español',exact:true}).click()
  const editor=page.getByLabel(lang==='pt'?'Mensagem em português':'Mensaje en español',{exact:true}),other=page.getByLabel('Nome da campanha',{exact:true});await editor.focus();let expected=initial
  if(test==='cut-paste'){await editor.press('Control+a');await editor.press('Control+x');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),initial,'Cut clipboard must carry literal URL');await editor.press('Control+v')}
  if(test==='cut-undo'){await editor.press('Control+a');await editor.press('Control+x');await editor.press('Control+z')}
  if(test==='paste-undo'){await editor.press('Control+a');await page.evaluate(()=>navigator.clipboard.writeText('COLADO'));await editor.press('Control+v');await editor.press('Control+z')}
  if(test==='typing-undo-blur'){await editor.press('Control+End');await editor.pressSequentially(' NOVO');await other.focus();await editor.focus();await editor.press('Control+z');expected='Texto original NOV'}
  if(test==='replace-limit'){await editor.press('Control+a');await page.evaluate(()=>navigator.clipboard.writeText('novo texto'));await editor.press('Control+v');expected='novo texto'}
  if(test==='replace-partial-limit'){await editor.press('Control+End');await editor.press('Shift+ArrowLeft');await editor.press('Shift+ArrowLeft');await page.evaluate(()=>navigator.clipboard.writeText('123'));await editor.press('Control+v');expected='x'.repeat(19997)+'123'}
  if(test==='reject-limit'){await editor.press('Control+End');await page.evaluate(()=>navigator.clipboard.writeText('xx'));await editor.press('Control+v')}
  if(test==='caret-blur'){await editor.press('Control+Home');await editor.press('ArrowRight');await editor.press('ArrowRight');await editor.pressSequentially('X');await other.focus();await editor.focus();await editor.pressSequentially('Y');expected='abXYcdef'}
  const actual=await editor.evaluate(e=>window.serialize(e));assert.equal(actual,expected,test+' canonical text')
  await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click();await page.getByText('Rascunho salvo. Nenhum e-mail foi enviado.',{exact:true}).waitFor();assert.equal(saved[lang==='pt'?'body_pt':'body_es'],expected,test+' saved')
  await page.getByRole('button',{name:'Campanhas',exact:true}).click();await page.getByRole('button',{name:/Teste sintético/}).click();assert.equal(await editor.evaluate(e=>window.serialize(e)),expected,test+' reopened')
  if(test==='cut-paste')assert.equal(await editor.getByRole('link',{name:lang==='pt'?'clique aqui para falar comigo':'haz clic aquí para hablar conmigo',exact:true}).getAttribute('href'),link)
  results.push({test,lang,passed:true});console.log('PASS',test,lang);await context.close()
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[])
}finally{await browser.close();await new Promise(r=>server.close(r));writeFileSync(resolve(out,'editor-native-report.json'),JSON.stringify({checked_at:new Date().toISOString(),source:'Real page/native clipboard; synthetic API persistence/generation; loopback only; no provider send',results,errors,external},null,2),{flag:'wx'})}
