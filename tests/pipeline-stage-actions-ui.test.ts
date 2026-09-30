/* eslint-disable @typescript-eslint/no-explicit-any -- Real component loaded across isolated context boundary. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const native = createRequire(import.meta.url)
function load(file: string): any {
 const m = {exports:{} as any}
 const js = ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
 new Function('require','module','exports',js)((name:string)=>name.startsWith('.')?load(resolve(dirname(file),name+'.ts')):name.startsWith('@/')?load(resolve('src',name.slice(2)+'.ts')):native(name),m,m.exports)
 return m.exports
}
function component() {
 let loaded: any = {}; try { loaded=load(resolve('src/components/pipeline-stage-actions.tsx')) } catch {}
 assert.equal(typeof loaded.StageActionsStrip,'function','stage strip component exists')
 return loaded.StageActionsStrip
}
const item = (enabled: boolean,id='item') => ({id,name:'Named action',enabled})
const ready = {status:'ready',pipelineId:'pipe',stages:[{id:'stage',sequences:[item(true,'a'),item(true,'b'),item(false,'c')],automations:[]}]}
test('real strip renders counts, explicit none and direct item edit links in PT/EN/ES',()=>{
 const C=component()
 for (const [locale,count,none] of [['pt','2 ativas · 1 inativa','Nenhuma'],['en','2 active · 1 inactive','None'],['es','2 activas · 1 inactiva','Ninguna']]) {
  const html=renderToStaticMarkup(React.createElement(C,{stageId:'stage',stageName:'Novo',state:ready,locale,returnTo:'/m/pipeline'}))
  assert.ok(html.includes(count));assert.ok(html.includes(none));assert.ok(html.includes('<summary'))
  assert.ok(html.includes('edit=a'));assert.ok(html.includes('returnTo=%2Fm%2Fpipeline'));assert.ok(!html.includes('checkbox'))
 }
})
test('loading, failure, restricted and unknown stage are not empty states or edit links',()=>{
 const C=component()
 for (const status of ['loading','error','restricted','ready']) {
  const html=renderToStaticMarkup(React.createElement(C,{stageId:'missing',stageName:'Novo',state:{...ready,status},locale:'pt'}))
  assert.ok(!html.includes('Nenhuma'));assert.ok(!html.includes('edit='));assert.ok(!html.includes('Named action'))
  assert.ok(html.includes(status==='loading'?'Carregando':status==='restricted'?'Somente o dono':'Indisponível'))
 }
})
test('pseudo pipeline has an informational PT/EN/ES state, no empty counts, retry or edit',()=>{
 const C=component()
 for(const [locale,message] of [['pt','Não se aplica'],['en','Not applicable'],['es','No aplica']]){
  const html=renderToStaticMarkup(React.createElement(C,{stageId:'pseudo-member',stageName:'Assigned',state:{status:'not-applicable',pipelineId:'pseudo-pipe-member'},locale,onRetry:()=>{}}))
  assert.ok(html.includes(message));assert.ok(!html.includes('Nenhuma'));assert.ok(!html.includes('None'));assert.ok(!html.includes('Ninguna'))
  assert.ok(!html.includes('<button'));assert.ok(!html.includes('edit='));assert.ok(!html.includes('<summary'))
 }
})
test('safe return rejects arbitrary paths and only keeps known pipeline identity',()=>{
 const m=load(resolve('src/lib/pipeline-action-links.ts'))
 for(const path of ['https://evil.invalid','//evil.invalid','/dashboard/automations','/dashboard/pipeline/evil','/m/pipeline?next=https://evil.invalid']) assert.equal(m.safePipelineReturn(path),path.startsWith('/m/pipeline?')?'/m/pipeline':'/dashboard/pipeline')
 assert.equal(m.safePipelineReturn('/m/pipeline'),'/m/pipeline')
 assert.equal(m.resolveActionEdit('?edit=b',[{id:'a'},{id:'b'}])?.id,'b')
 assert.equal(m.resolveActionEdit('?edit=foreign',[{id:'a'}]),null)
})
