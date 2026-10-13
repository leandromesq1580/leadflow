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
const nextFixture={...fixture,subject_pt:'E quando os planos mudam?',body_pt:'Uma mudança de fase também pode mudar o que você precisa proteger. Vamos conversar sobre como o seguro de vida pode ajudar, conforme a apólice.\n\nhttps://wa.me/17867442126?text=Ol%C3%A1',subject_es:'¿Y cuando cambian los planes?',body_es:'Una nueva etapa también puede cambiar lo que necesitas proteger. Conversemos sobre cómo puede ayudar el seguro de vida, según la póliza.\n\nhttps://wa.me/17867442126?text=Hola'}
let currentCopy=fixture,successfulGenerations=0
const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from '${resolve(repo,'src/app/admin/email-campaigns/page.tsx')}';import{campaignBodyFromEditor}from'${resolve(repo,'src/lib/email-campaign-editor.ts')}';window.__campaignBodyFromEditor=campaignBodyFromEditor;createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:repo,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfig:resolve(repo,'tsconfig.json')})
const css=await postcss([tailwind({base:repo})]).process(readFileSync(resolve(repo,'src/app/globals.css'),'utf8'),{from:resolve(repo,'src/app/globals.css')})
const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${css.css}@font-face{font-family:Geist;src:url('/geist.woff2');font-weight:100 900}body{font-family:Geist,Arial,sans-serif;padding:16px;background:#f8fafc}#root{max-width:1160px;margin:auto}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`
const server=createServer((req,res)=>{if(req.url==='/geist.woff2'){res.setHeader('Content-Type','font/woff2');res.end(readFileSync(resolve(repo,'src/fonts/geist-latin.woff2')))}else{res.setHeader('Content-Type','text/html');res.end(html)}})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const origin='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({headless:true,executablePath:process.env.EC_TEST_CHROME||'/home/hermes/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',args:['--no-sandbox']})
const checks=[],requests=[],screenshots=[],errors=[],external=[]
let mode='success',accept=false
const check=(name,value)=>{assert.ok(value,name);checks.push(name)}
const editorValue=locator=>locator.evaluate(element=>window.__campaignBodyFromEditor(element))
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
    if(mode==='error')return route.fulfill({status:503,json:{error:'A geração por IA ainda não está configurada.'}})
    currentCopy=successfulGenerations++===0?fixture:nextFixture
    return route.fulfill({json:{copy:currentCopy}})
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
 check('Prévia IA PT mostra hyperlink com texto curto',await page.getByTestId('ai-body').getByRole('link',{name:'clique aqui para falar comigo',exact:true}).getAttribute('href')===fixture.body_pt.split('\n').at(-1))
 check('Prévia IA PT não exibe URL do WhatsApp',!(await page.getByTestId('ai-body').innerText()).includes('https://wa.me'))
 await page.getByRole('button',{name:'Vista en español',exact:true}).click()
 check('Prévia ES conserva texto e mostra rótulo espanhol',await page.getByTestId('ai-body').innerText()===fixture.body_es.replace(fixture.body_es.split('\n').at(-1),'haz clic aquí para hablar conmigo'))
 check('Prévia IA ES mantém destino exato',await page.getByTestId('ai-body').getByRole('link',{name:'haz clic aquí para hablar conmigo',exact:true}).getAttribute('href')===fixture.body_es.split('\n').at(-1))
 await page.getByRole('button',{name:'Gerar outra versão',exact:true}).click();await page.waitForFunction(subject=>document.querySelector('[data-testid="ai-subject"]')?.textContent===subject,nextFixture.subject_es)
 const generations=requests.filter(r=>r.path.endsWith('/generate'))
 check('Segundo clique pede outro ângulo',generations[0].body.variation===0&&generations[1].body.variation===1)
 check('Segundo clique leva ideia anterior, sem o contato',generations[1].body.previous.length===1&&generations[1].body.previous[0].subject_pt===fixture.subject_pt&&!JSON.stringify(generations[1].body.previous).includes('wa.me'))
 check('Segunda sugestão muda a ideia e assunto',await page.getByTestId('ai-subject').textContent()===nextFixture.subject_es&&await page.getByTestId('ai-body').innerText()!==fixture.body_es)
 await page.getByRole('button',{name:'Usar textos no rascunho',exact:true}).click()
 check('Recusar substituição preserva conteúdo',await editorValue(page.getByLabel('Mensagem em português',{exact:true}))==='Mensagem original preservada')
 accept=true;await page.getByRole('button',{name:'Usar textos no rascunho',exact:true}).click()
 check('Aplicar atualiza PT sem perder destino',await editorValue(page.getByLabel('Mensagem em português',{exact:true}))===currentCopy.body_pt)
 check('Editor PT mantém nome do hyperlink',await page.getByLabel('Mensagem em português',{exact:true}).getByRole('link',{name:'clique aqui para falar comigo',exact:true}).getAttribute('href')===currentCopy.body_pt.split('\n').at(-1))
 check('Editor PT não mostra URL crua',!(await page.getByLabel('Mensagem em português',{exact:true}).innerText()).includes('https://wa.me'))
 check('Aplicar preserva nome existente',await page.getByLabel('Nome da campanha',{exact:true}).inputValue()==='Nome original preservado')
 await page.getByRole('button',{name:'Español',exact:true}).click()
 check('Aplicar atualiza ES sem perder destino',await editorValue(page.getByLabel('Mensaje en español',{exact:true}))===currentCopy.body_es)
 check('Editor ES mantém nome do hyperlink',await page.getByLabel('Mensaje en español',{exact:true}).getByRole('link',{name:'haz clic aquí para hablar conmigo',exact:true}).getAttribute('href')===currentCopy.body_es.split('\n').at(-1))
 await page.locator('summary').filter({hasText:'Prévia do conteúdo'}).click()
 check('Prévia do rascunho ES usa o mesmo hyperlink',await page.getByTestId('campaign-body-preview').getByRole('link',{name:'haz clic aquí para hablar conmigo',exact:true}).getAttribute('href')===currentCopy.body_es.split('\n').at(-1))
 await page.getByRole('button',{name:'Português',exact:true}).click()
 check('Prévia do rascunho PT usa o mesmo hyperlink',await page.getByTestId('campaign-body-preview').getByRole('link',{name:'clique aqui para falar comigo',exact:true}).getAttribute('href')===currentCopy.body_pt.split('\n').at(-1))
 const editor=page.getByLabel('Mensagem em português',{exact:true});await editor.focus();await editor.press('Control+Home');await editor.pressSequentially('Ajuste: ')
 if(await editorValue(editor)!=='Ajuste: '+currentCopy.body_pt)console.log('EDITOR_EDIT_DIAGNOSTIC',JSON.stringify({actual:await editorValue(editor),expected:'Ajuste: '+currentCopy.body_pt,html:await editor.innerHTML()}))
 check('Editar mantém texto e destino exato',await editorValue(editor)==='Ajuste: '+currentCopy.body_pt)
 await page.getByRole('button',{name:'Español',exact:true}).click();await page.getByRole('button',{name:'Português',exact:true}).click()
 check('Trocar idioma mantém edição e hyperlink nomeado',await editorValue(editor)==='Ajuste: '+currentCopy.body_pt&&await editor.getByRole('link',{name:'clique aqui para falar comigo',exact:true}).count()===1)
 await editor.evaluate(element=>{
  element.focus();const range=document.createRange();range.selectNodeContents(element);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range)
  const data=new DataTransfer();data.setData('text/html','<img src=x onerror="window.syntheticPasteXSS=true">');data.setData('text/plain','\n<img src=x onerror="window.syntheticPasteXSS=true">');element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))
 })
 check('Colagem rica vira texto literal e não executa HTML',await editor.locator('img').count()===0&&await page.evaluate(()=>!window.syntheticPasteXSS))
 check('Colagem preserva URL e texto existente',(await editorValue(editor)).startsWith('Ajuste: '+currentCopy.body_pt+'\n<img'))
 await editor.fill('Ajuste: '+currentCopy.body_pt);await page.getByLabel('Assunto em português',{exact:true}).focus()
 const copied=await editor.evaluate(element=>{element.focus();const range=document.createRange();range.selectNodeContents(element);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);const data=new DataTransfer();element.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));return data.getData('text/plain')})
 if(copied!=='Ajuste: '+currentCopy.body_pt)console.log('COPY_DIAGNOSTIC',JSON.stringify({copied,expected:'Ajuste: '+currentCopy.body_pt,html:await editor.innerHTML(),serialized:await editorValue(editor)}))
 check('Copiar o editor preserva endereço, não só o rótulo',copied==='Ajuste: '+currentCopy.body_pt)
 check('Texto longo não aparece na prévia do rascunho',!(await page.getByTestId('campaign-body-preview').innerText()).includes('https://wa.me'))
 await page.getByRole('button',{name:'Español',exact:true}).click()
 await page.getByLabel('Mensaje en español',{exact:true}).fill('<img src=x onerror="window.syntheticXSS=true">\n'+currentCopy.body_es)
 check('Prévia escapa HTML colado no rascunho',await page.getByTestId('campaign-body-preview').locator('img,script').count()===0&&await page.evaluate(()=>window.syntheticXSS===undefined))
 await page.getByLabel('Mensaje en español',{exact:true}).evaluate((element,text)=>{
  element.focus();const range=document.createRange();range.selectNodeContents(element);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);const data=new DataTransfer();data.setData('text/plain',text);element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))
 },currentCopy.body_es);await page.getByLabel('Asunto en español',{exact:true}).focus()
 check('Texto simples reaplica rótulo sem perder URL',await editorValue(page.getByLabel('Mensaje en español',{exact:true}))===currentCopy.body_es&&await page.getByLabel('Mensaje en español',{exact:true}).getByRole('link',{name:'haz clic aquí para hablar conmigo',exact:true}).count()===1)
 check('Aplicar não salva, não agenda e não envia',requests.every(r=>r.method!=='POST'||r.path.endsWith('/generate')))
 for(const [name,width,dark] of [['desktop',1280,false],['mobile',390,false],['mobile-dark',390,true],['narrow',320,false]]){
  await page.setViewportSize({width,height:1000});await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark)
  check(name+' sem rolagem horizontal',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  const file=resolve(out,'email-ai-'+name+'.png');await page.screenshot({path:file,fullPage:true});screenshots.push(file)
 }
 mode='error';await page.getByRole('button',{name:'Gerar outra versão',exact:true}).click();await page.getByRole('alert').filter({hasText:'A geração por IA ainda não está configurada.'}).waitFor()
 check('Falha da IA preserva texto aplicado',await editorValue(page.getByLabel('Mensaje en español',{exact:true}))===currentCopy.body_es)
 check('Falha da IA preserva sugestão anterior visível',await page.getByTestId('ai-body').count()===1)
 mode='success';await page.getByRole('button',{name:'Gerar outra versão',exact:true}).click();await page.getByTestId('ai-body').waitFor();await page.getByRole('button',{name:'Gerar outra versão',exact:true}).waitFor()
 await page.getByLabel('Orientação geral para IA').fill('Nova orientação genérica')
 check('Alterar orientação invalida prévia anterior',await page.getByTestId('ai-body').count()===0)
 mode='slow';await page.getByRole('button',{name:'Gerar sugestões',exact:true}).click()
 await page.getByRole('button',{name:'Campanhas',exact:true}).click();await page.getByRole('button',{name:'Nova campanha',exact:true}).click()
 await page.waitForTimeout(400)
 await page.getByRole('button',{name:'Português',exact:true}).click()
 check('Trocar editor descarta resposta atrasada',await page.getByTestId('ai-body').count()===0)
 check('Nova campanha não herda nome/texto da antiga',await page.getByLabel('Nome da campanha',{exact:true}).inputValue()===''&&await editorValue(page.getByLabel('Mensagem em português',{exact:true}))==='')
 check('Nenhum erro de execução no navegador',errors.length===0)
 check('Nenhum destino externo acessado',external.length===0)
 const proof={checked_at:new Date().toISOString(),source:'Actual editor/page/CSS; local loopback; API responses explicitly synthetic; no production login or provider send',checks,passed:checks.length,screenshots,errors,external,requests}
 writeFileSync(resolve(out,'email-ai-ui.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2))
}finally{await browser.close();await new Promise(r=>server.close(r))}
