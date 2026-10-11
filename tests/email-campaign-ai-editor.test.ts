import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {createElement} from 'react'
import * as React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

test('editor de IA começa sem enviar, com WhatsApp indicado e revisão explícita',async()=>{
 assert.ok(existsSync(new URL('../src/components/admin/EmailCampaignAIGenerator.tsx',import.meta.url)),'O editor ainda não oferece geração por IA')
 ;(globalThis as typeof globalThis & {React:typeof React}).React=React // tsx standalone JSX; Next uses automatic runtime.
 const {default:Generator}=await import('../src/components/admin/EmailCampaignAIGenerator')
 let applied=0
 const html=renderToStaticMarkup(createElement(Generator,{disabled:false,hasContent:false,onApply:()=>applied++}))
 assert.match(html,/Gerar com IA/);assert.match(html,/1 863 280 8696/)
 assert.match(html,/Nada é salvo ou enviado ao gerar/);assert.match(html,/Tipo de seguro/)
 assert.equal(applied,0)
})
