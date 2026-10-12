import test from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import * as React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {existsSync} from 'node:fs'

const link='https://wa.me/17867442126?text=Ol%C3%A1!%20Quero%20uma%20cota%C3%A7%C3%A3o'
test('editor do rascunho exibe link nomeado, não textarea com URL crua, nos dois idiomas',async()=>{
 assert.ok(existsSync(new URL('../src/components/admin/CampaignBodyEditor.tsx',import.meta.url)),'Rascunho ainda usa texto puro e perde o nome do hyperlink')
 ;(globalThis as typeof globalThis & {React:typeof React}).React=React
 const {default:Editor}=await import('../src/components/admin/CampaignBodyEditor')
 for(const language of ['pt','es'] as const){
  let writes=0
  const html=renderToStaticMarkup(createElement(Editor,{value:'Olá!\n\n'+link,language,label:'Mensagem',disabled:false,onChange:()=>writes++}))
  assert.match(html,/role="textbox"/)
  assert.match(html,/contentEditable="true"/)
  assert.match(html,/<a contenteditable="false" href=/)
  assert.match(html,language==='pt'?/>clique aqui para falar comigo<\//:/>haz clic aquí para hablar conmigo<\//)
  assert.match(html,/href="https:\/\/wa\.me\/17867442126\?text=Ol%C3%A1/)
  assert.doesNotMatch(html,/>https:\/\/wa\.me/)
  assert.equal(writes,0)
 }
})
