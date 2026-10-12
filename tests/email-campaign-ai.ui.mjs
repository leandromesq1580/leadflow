// UI real, API simulada identificada; nenhuma autenticação de produção, base ou envio real.
import {createRequire} from 'node:module'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'node:http'
import assert from 'node:assert/strict'
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=process.env.EC_TEST_OUTPUT,tools=process.env.EC_TEST_TOOL_DIR
if(!out||!tools)throw new Error('EC_TEST_OUTPUT and EC_TEST_TOOL_DIR required')
mkdirSync(out,{recursive:true})
const require=createRequire(repo+'/package.json'),toolRequire=createRequire(tools+'/package.json')
const esbuild=require('esbuild'),postcss=require('postcss'),tailwind=require('@tailwindcss/postcss'),{chromium}=toolRequire('playwright')
const fixture={name:'Sugestão sintética',subject_pt:'Conheça opções de seguro',body_pt:'Podemos ajudar você a entender suas opções de seguro. Fale conosco pelo WhatsApp para saber mais ou solicitar uma cotação.\n\nhttps://wa.me/17867442126?text=Ol%C3%A1',subject_es:'Conoce opciones de seguro',body_es:'Podemos ayudarte a conocer tus opciones de seguro. Escríbenos por WhatsApp para saber más o solicitar una cotización.\n\nhttps://wa.me/17867442126?text=Hola'}
const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from '${resolve(repo,'src/app/admin/email-campaigns/page.tsx')}';createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:repo,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfig:resolve(repo,'tsconfig.json')})
const css=await postcss([tailwind({base:repo})]).process(readFileSync(resolve(repo,'src/app/globals.css'),'utf8'),{from:resolve(repo,'src/app/globals.css')})
const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${css.css}@font-face{font-family:Geist;src:url('/geist.woff2');font-weight:100 900}body{font-family:Geist,Arial,sans-serif;padding:16px;background:#f8fafc}#root{max-width:1160px;margin:auto}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`
const server=createServer((req,res)=>{if(req.url==='/geist.woff2'){res.setHeader('Content-Type','font/woff2');res.end(readFileSync(resolve(repo,'src/fonts/geist-latin.woff2')))}else{res.setHeader('Content-Type','text/html');res.end(html)}})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const origin='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({headless:true,executablePath:process.env.EC_TEST_CHROME||'/home/hermes/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox']})
const checks=[],requests=[],screenshots=[],errors=[],external=[]
let mode='success',accept=false
const check=(name,value)=>{assert.ok(value,name);checks.push(name)}
try{
 const context=await browser.newContext({viewport:{width:1280,height:1000}})
 await context.route('**/*',async route=>{
  const request=route.request(),url=request.url()
  if(!url.startsWith(origin+'/')){external.push(url);return route.abort()}
  if(url.includes('/api/admin/email-campaigns')){
   requests.push({method:request.method(),path:new URL(url).pathname,body:request.postDataJSON()})
   if(request.method()==='GET')return route.fulfill({json:{configuration:{ready:true,issues:[],from:'synthetic@example.invalid',dailyLimit:200,domainVerified:true},buyers:[],campaigns:[],total_campaigns:0,recipients:[],total_recipients:0}})
   if(new URL(url).pathname.endsWith('/generate')){
    if(mode==='slow')await new Promise(r=>setTimeout(r,250))
    return mode==='error'?route.fulfill({status:503,json:{error:'A geração por IA ainda não está configurada.'}}):route.fulfill({json:{copy:fixture}})
   }
   return route.fulfill({status:500,json:{error:'Gravação não prevista no teste'}})
  }
  return route.continue()
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept():d.dismiss())
 await page.goto(origin);await page.getByText('Sua primeira campanha começa aqui').waitFor()
 await page.getByRole('button',{name:'Nova campanha',exact:true}).click()
 await page.getByLabel('Nome da campanha',{exact:true}).fill('Nome original preservado')
 await page.getByLabel('Assunto em português',{exact:true}).fill('Assunto original')
 await page.getByLabel('Mensagem em português',{exact:true}).fill('Mensagem original preservada')
 await page.locator('summary').filter({hasText:'Gerar com IA'}).click()
 check('WhatsApp indicado preenchido',await page.getByLabel('WhatsApp de atendimento para IA').inputValue()==='1 786 744 2126')
 await page.getByRole('button',{name:'Gerar sugestões',exact:true}).click();await page.getByTestId('ai-subject').waitFor()
 check('Gerar mantém o rascunho',await page.getByLabel('Assunto em português',{exact:true}).inputValue()==='Assunto original')
 check('Prévia PT mostra assunto real do retorno',await page.getByTestId('ai-subject').textContent()===fixture.subject_pt)
 await page.getByRole('button',{name:'Vista en español',exact:true}).click()
 check('Prévia ES disponível',await page.getByTestId('ai-body').textContent()===fixture.body_es)
 await page.getByRole('button',{name:'Usar textos no rascunho',exact:true}).click()
 check('Recusar substituição preserva conteúdo',await page.getByLabel('Mensagem em português',{exact:true}).inputValue()==='Mensagem original preservada')
 accept=true;await page.getByRole('button',{name:'Usar textos no rascunho',exact:true}).click()
 check('Aplicar atualiza PT',await page.getByLabel('Mensagem em português',{exact:true}).inputValue()===fixture.body_pt)
 check('Aplicar preserva nome existente',await page.getByLabel('Nome da campanha',{exact:true}).inputValue()==='Nome original preservado')
 await page.getByRole('button',{name:'Español',exact:true}).click()
 check('Aplicar atualiza ES',await page.getByLabel('Mensaje en español',{exact:true}).inputValue()===fixture.body_es)
 check('Aplicar não salva, não agenda e não envia',requests.every(r=>r.method!=='POST'||r.path.endsWith('/generate')))
 for(const [name,width,dark] of [['desktop',1280,false],['mobile',390,false],['mobile-dark',390,true],['narrow',320,false]]){
  await page.setViewportSize({width,height:1000});await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark)
  check(name+' sem rolagem horizontal',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  const file=resolve(out,'email-ai-'+name+'.png');await page.screenshot({path:file,fullPage:true});screenshots.push(file)
 }
 mode='error';await page.getByRole('button',{name:'Gerar outra versão',exact:true}).click();await page.getByRole('alert').filter({hasText:'A geração por IA ainda não está configurada.'}).waitFor()
 check('Falha da IA preserva texto aplicado',await page.getByLabel('Mensaje en español',{exact:true}).inputValue()===fixture.body_es)
 mode='success';await page.getByRole('button',{name:'Gerar sugestões',exact:true}).click();await page.getByTestId('ai-body').waitFor()
 await page.getByLabel('Orientação geral para IA').fill('Nova orientação genérica')
 check('Alterar orientação invalida prévia anterior',await page.getByTestId('ai-body').count()===0)
 mode='slow';await page.getByRole('button',{name:'Gerar sugestões',exact:true}).click()
 await page.getByRole('button',{name:'Campanhas',exact:true}).click();await page.getByRole('button',{name:'Nova campanha',exact:true}).click()
 await page.waitForTimeout(400)
 await page.getByRole('button',{name:'Português',exact:true}).click()
 check('Trocar editor descarta resposta atrasada',await page.getByTestId('ai-body').count()===0)
 check('Nova campanha não herda nome/texto da antiga',await page.getByLabel('Nome da campanha',{exact:true}).inputValue()===''&&await page.getByLabel('Mensagem em português',{exact:true}).inputValue()==='')
 check('Nenhum erro de execução no navegador',errors.length===0)
 check('Nenhum destino externo acessado',external.length===0)
 const proof={checked_at:new Date().toISOString(),source:'Actual editor/page/CSS; local loopback; API responses explicitly synthetic; no production login or provider send',checks,passed:checks.length,screenshots,errors,external,requests}
 writeFileSync(resolve(out,'email-ai-ui.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2))
}finally{await browser.close();await new Promise(r=>server.close(r))}
