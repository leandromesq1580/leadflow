// Actual React page + actual HTTP/API handlers + isolated PostgreSQL (PGlite).
// Synthetic contacts/storage only; every external request is intercepted; no email send.
import {createRequire} from 'node:module'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'node:http'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {createCampaignHandlers} from '../src/lib/email-campaign-api.ts'
import {createCampaignImageHandler} from '../src/lib/email-campaign-images.ts'
import {campaignConfiguration,renderCampaignEmail} from '../src/lib/email-campaigns.ts'
import {isRichCampaignBody} from '../src/lib/email-campaign-rich.ts'
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=process.env.EC_TEST_OUTPUT,tools=process.env.EC_TEST_TOOL_DIR
if(!out||!tools)throw Error('EC_TEST_OUTPUT and EC_TEST_TOOL_DIR required')
mkdirSync(out,{recursive:true});const require=createRequire(tools+'/package.json'),appRequire=createRequire(repo+'/package.json')
const {chromium}=require('playwright'),esbuild=appRequire('esbuild'),postcss=appRequire('postcss'),tailwind=appRequire('@tailwindcss/postcss')
const actor='00000000-0000-0000-0000-000000000001',db=new PGlite()
await db.exec(`create role anon;create role authenticated;create role service_role;create table buyers(id uuid primary key,is_admin boolean,name text);create table leads(id uuid primary key default gen_random_uuid(),name text,email text,state text,type text default 'hot',assigned_to uuid,lead_language text,form_name text,created_at timestamptz default now());insert into buyers(id,is_admin)values('${actor}',true);`)
for(const f of ['062_admin_email_campaigns.sql','063_email_campaign_tracking_resend.sql'])await db.exec(readFileSync(resolve(repo,'supabase/migrations',f),'utf8'))
const cfg=campaignConfiguration({RESEND_API_KEY:'synthetic-only',RESEND_FROM_EMAIL:'synthetic@example.invalid',MANUAL_EMAIL_POSTAL_ADDRESS:'Synthetic postal address',EMAIL_CAMPAIGN_WEBHOOK_SECRET:'synthetic',EMAIL_CAMPAIGNS_ENABLED:'true'})
let sends=0,uploads=0,started,releaseUpload
const uploadStarted=new Promise(r=>started=r),uploadGate=new Promise(r=>releaseUpload=r),stored=new Map()
const handlers=createCampaignHandlers({
 authenticate:async()=>({id:actor}),
 runtime:()=>({
  config:cfg,provider:{verifyDomain:async()=>true,send:async()=>{sends++;throw Error('NO_REAL_EMAIL')}},
  db:{rpc:async(n,args)=>{
   try{
    assert.match(n,/^ec_[a-z_]+$/);const entries=Object.entries(args);entries.forEach(([k])=>assert.match(k,/^p_[a-z_]+$/))
    const result=await db.query(`select public.${n}(${entries.map(([k],i)=>`${k} => $${i+1}`).join(',')}) value`,entries.map(([,v])=>v))
    return{data:result.rows[0].value,error:null}
   }catch(e){return{data:null,error:{message:e.message}}}
  }},
 }),
})
const imageHandler=createCampaignImageHandler({authenticate:async()=>({id:actor}),upload:async({bytes})=>{uploads++;started();await uploadGate;const url='https://campaign-images.example.invalid/upload-'+uploads+'.png';stored.set(url,Buffer.from(bytes));return{url}}})
const bundle=await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import Page from '${resolve(repo,'src/app/admin/email-campaigns/page.tsx')}';createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:repo,loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},tsconfig:resolve(repo,'tsconfig.json')})
const css=await postcss([tailwind({base:repo})]).process(readFileSync(resolve(repo,'src/app/globals.css'),'utf8'),{from:resolve(repo,'src/app/globals.css')})
const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}body{font-family:Arial,sans-serif;padding:16px;background:#f8fafc}#root{max-width:1160px;margin:auto}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`
const server=createServer(async(req,res)=>{try{if(req.url.startsWith('/api/admin/email-campaigns')){const chunks=[];for await(const c of req)chunks.push(c);const request=new Request('http://127.0.0.1:'+server.address().port+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});const response=await(req.url==='/api/admin/email-campaigns/images'?imageHandler(request):handlers[req.method](request));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text())}else if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html)}else{res.writeHead(404);res.end()}}catch(e){res.writeHead(500);res.end('synthetic_test_failure')}})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port
const png=readFileSync(resolve(repo,'tests/fixtures/campaign-rich-family.png')),wa='https://wa.me/17867442126?text=Ol%C3%A1%20cotacao'
const browser=await chromium.launch({headless:true,executablePath:process.env.EC_TEST_CHROME,args:['--no-sandbox']}),checks=[],errors=[],external=[]
const check=(name,ok)=>{assert.ok(ok,name);checks.push({name,passed:true})}
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}})
 await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin))return route.continue();if(url==='https://campaign-images.example.invalid/by-url.png'||stored.has(url))return route.fulfill({status:200,contentType:'image/png',body:stored.get(url)||png});external.push(url);return route.abort()})
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(origin)
 await page.getByRole('button',{name:'Nova campanha',exact:true}).click();await page.getByLabel('Nome da campanha',{exact:true}).fill('Synthetic Rich Campaign');await page.getByLabel('Assunto em português',{exact:true}).fill('Seguro de vida')
 const editor=()=>page.getByLabel('Mensagem em português',{exact:true})
 await editor().fill('Seguro de vida\n\n'+wa)
 await page.getByRole('button',{name:'Editar HTML',exact:true}).click();await page.getByRole('button',{name:'Aplicar HTML'}).click()
 await editor().evaluate(e=>{const text=document.createTreeWalker(e,NodeFilter.SHOW_TEXT).nextNode();const r=document.createRange();r.setStart(text,0);r.setEnd(text,14);const s=getSelection();s.removeAllRanges();s.addRange(r)})
 await page.getByRole('button',{name:'Negrito',exact:true}).click()
 check('Negrito na seleção mantém link WhatsApp nomeado',await editor().locator('strong,b').innerText()==='Seguro de vida'&&await editor().getByRole('link',{name:'clique aqui para falar comigo'}).getAttribute('href')===wa)
 async function end(){await editor().evaluate(e=>{e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)})}
 await end();await page.getByRole('button',{name:'Inserir link',exact:true}).click();await page.getByLabel('Texto do link',{exact:true}).fill('Pedir orçamento');await page.getByLabel('Endereço do link',{exact:true}).fill('https://example.invalid/quote?lang=pt&source=email');await page.getByRole('dialog').getByRole('button',{name:'Inserir link',exact:true}).click()
 check('Novo hyperlink mantém nome e URL exata',await editor().getByRole('link',{name:'Pedir orçamento'}).getAttribute('href')==='https://example.invalid/quote?lang=pt&source=email')
 await end();await page.getByRole('button',{name:'Adicionar imagem',exact:true}).click();await page.getByLabel('Descrição da imagem',{exact:true}).fill('Família');await page.getByLabel('URL da imagem (HTTPS)',{exact:true}).fill('https://campaign-images.example.invalid/by-url.png');await page.getByRole('button',{name:'Inserir por URL'}).click()
 check('Imagem por URL aparece no editor',await editor().getByRole('img',{name:'Família'}).count()===1)
 await end();await page.getByRole('button',{name:'Adicionar imagem',exact:true}).click();await page.getByLabel('Descrição da imagem',{exact:true}).fill('Proteção');await page.getByLabel('Arquivo de imagem',{exact:true}).setInputFiles({name:'protection.png',mimeType:'image/png',buffer:png})
 await uploadStarted;check('Durante upload salvar e trocar idioma ficam bloqueados',await page.getByRole('button',{name:'Salvar rascunho'}).isDisabled()&&await page.getByRole('button',{name:'Español',exact:true}).isDisabled());releaseUpload()
 await editor().getByRole('img',{name:'Proteção'}).waitFor();check('Upload real HTTP insere imagem do armazenamento sintético',uploads===1&&stored.size===1)
 await page.getByRole('button',{name:'Editar HTML',exact:true}).click();const source=page.getByLabel('HTML da mensagem',{exact:true});const before=await source.inputValue();await source.fill(before+'<p><em>Condições conforme a apólice.</em></p><script>window.__unsafe=1</script><img src="javascript:alert(1)" onerror="alert(1)">');await page.getByRole('button',{name:'Aplicar HTML'}).click()
 check('HTML seguro preserva texto, remove execução e imagem perigosa',await editor().locator('em').innerText()==='Condições conforme a apólice.'&&await editor().locator('script,[onerror],img[src^="javascript:"]').count()===0&&await page.evaluate(()=>window.__unsafe===undefined))
 await page.getByRole('button',{name:'Español',exact:true}).click();await page.getByLabel('Asunto en español',{exact:true}).fill('Seguro de vida');await page.getByLabel('Mensaje en español',{exact:true}).fill('Seguro de vida para tu familia.\n\n'+wa)
 await page.getByRole('button',{name:'Editar HTML',exact:true}).click();await page.getByLabel('HTML da mensagem',{exact:true}).fill('<p><strong>Seguro de vida</strong> para tu familia.</p><a href="'+wa+'">habla conmigo aquí</a>');await page.getByRole('button',{name:'Aplicar HTML'}).click()
 await page.getByRole('button',{name:'Salvar rascunho'}).click();await page.getByText('Rascunho salvo. Nenhum e-mail foi enviado.').waitFor()
 const saved=(await db.query('select * from email_campaigns')).rows[0];check('PostgreSQL salva ambos idiomas com formatação',isRichCampaignBody(saved.body_pt)&&isRichCampaignBody(saved.body_es)&&saved.body_pt.includes('<strong>Seguro de vida</strong>')&&saved.body_es.includes('<strong>Seguro de vida</strong>'))
 await page.getByRole('button',{name:'Campanhas',exact:true}).click();await page.getByRole('button',{name:/Synthetic Rich Campaign/}).click();await page.getByRole('button',{name:'Português',exact:true}).click()
 check('Reabrir mantém negrito, 2 imagens e destinos completos',await editor().locator('strong').innerText()==='Seguro de vida'&&await editor().locator('img').count()===2&&await editor().getByRole('link',{name:'clique aqui para falar comigo'}).getAttribute('href')===wa&&await editor().getByRole('link',{name:'Pedir orçamento'}).count()===1)
 await page.locator('summary').filter({hasText:'Prévia do conteúdo'}).click();check('Prévia e HTML enviado usam mesma formatação',await page.getByTestId('campaign-body-preview').locator('strong').count()===1&&await page.getByTestId('campaign-body-preview').locator('img').count()===2)
 const rendered=renderCampaignEmail({campaign:saved,name:'Ana',language:'pt',unsubscribe_token:'00000000-0000-4000-8000-000000000001'},cfg);check('Email offline preserva imagem/link, descadastro e texto alternativo',rendered.html.includes('campaign-images.example.invalid/upload-1.png')&&rendered.html.includes('<strong>Seguro de vida</strong>')&&rendered.text.includes('Pedir orçamento')&&rendered.html.includes('Cancelar recebimento'))
 await editor().locator('..').screenshot({path:resolve(out,'rich-editor-desktop.png')})
 await page.setViewportSize({width:390,height:844});const box=await editor().locator('..').boundingBox();check('Editor sem ultrapassar tela de celular',box.x>=0&&box.x+box.width<=391);await editor().locator('..').screenshot({path:resolve(out,'rich-editor-mobile.png')})
 await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>document.documentElement.classList.add('dark'));await editor().locator('..').screenshot({path:resolve(out,'rich-editor-mobile-dark.png')})
 check('Nenhum email ou requisição externa de teste',sends===0&&external.length===0);check('Nenhum erro no navegador',errors.length===0)
 console.log(JSON.stringify({passed:true,checks:checks.length,emails_sent:sends,uploaded_images:uploads}))
}finally{writeFileSync(resolve(out,'rich-ui-report.json'),JSON.stringify({checked_at:new Date().toISOString(),checks,errors,external,emails_sent:sends,uploaded_images:uploads},null,2));releaseUpload();await browser.close();await new Promise(r=>server.close(r));await db.close()}
