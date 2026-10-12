import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createElement} from 'react'
import * as React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {OFFICIAL_WHATSAPP_NUMBER,OFFICIAL_WHATSAPP_DISPLAY} from '../src/lib/official-whatsapp'

const oldPhone=/18632808696|863[\s()-]*280[\s()-]*8696/

test('contato oficial tem dígitos e exibição consistentes com a instrução do dono',()=>{
 assert.equal(OFFICIAL_WHATSAPP_NUMBER,'17867442126')
 assert.equal(OFFICIAL_WHATSAPP_DISPLAY.replace(/\D/g,''),OFFICIAL_WHATSAPP_NUMBER)
})
test('CTA real abre o novo contato preservando mensagem, nova aba e evento Lead',async()=>{
 ;(globalThis as typeof globalThis & {React:typeof React}).React=React
 const {WhatsAppLeadCta}=await import('../src/components/whatsapp-lead-cta')
 const message='Olá! Quero conversar sobre opções & detalhes.'
 const html=renderToStaticMarkup(createElement(WhatsAppLeadCta,{label:'Conversar',message}))
 const href=html.match(/href="([^"]+)"/)?.[1]
 assert.ok(href)
 const link=new URL(href.replace(/&amp;/g,'&'))
 assert.equal(link.origin,'https://wa.me');assert.equal(link.pathname,'/'+OFFICIAL_WHATSAPP_NUMBER)
 assert.equal(link.searchParams.get('text'),message)
 assert.match(html,/target="_blank"/);assert.match(html,/rel="noopener noreferrer"/)
 assert.doesNotMatch(html,oldPhone)
 const source=readFileSync(new URL('../src/components/whatsapp-lead-cta.tsx',import.meta.url),'utf8')
 assert.match(source,/'track', 'Lead'/)
})
for(const path of ['nova/index.html','nova/en/index.html','nova/es/index.html']){
 test('landing '+path+' usa o oficial no suporte e na configuração dos botões',()=>{
  const source=readFileSync(new URL('../public/'+path,import.meta.url),'utf8')
  const contacts=[...source.matchAll(/https:\/\/wa\.me\/(\d+)/g)].map(x=>x[1])
  assert.equal(contacts.length,2,'Suporte e configuração de WhatsApp devem ser conferidos')
  assert.deepEqual(contacts,[OFFICIAL_WHATSAPP_NUMBER,OFFICIAL_WHATSAPP_NUMBER])
  assert.doesNotMatch(source,oldPhone)
 })
}
test('landing antiga usa a constante oficial no botão flutuante',()=>{
 const source=readFileSync(new URL('../src/app/old/page.tsx',import.meta.url),'utf8')
 assert.match(source,/<WhatsAppFab phone=\{OFFICIAL_WHATSAPP_NUMBER\}/)
 assert.doesNotMatch(source,oldPhone)
})
