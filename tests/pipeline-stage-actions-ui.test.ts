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
test('one inline lightning control for mixed active types, with an initially hidden popup and no status strip',()=>{
 const C=component()
 for(const [locale,label] of [['pt','Ações ativas de Novo'],['en','Active actions for Novo'],['es','Acciones activas de Novo']]) {
  const state={...ready,stages:[{...ready.stages[0],automations:[item(true,'auto')]}]}
  const html=renderToStaticMarkup(React.createElement(C,{stageId:'stage',stageName:'Novo',state,locale}))
  assert.equal((html.match(/⚡/g)||[]).length,1)
  assert.ok(html.includes(`aria-label="${label}"`))
  assert.ok(html.includes('hidden=""')); assert.ok(html.includes('display:none'))
  assert.ok(html.includes('aria-expanded="false"')); assert.ok(html.includes('role="dialog"'))
  assert.ok(!html.includes('<details')); assert.ok(!html.includes('<summary'))
 }
})
test('real strip renders only active counts, details and exact edit links in PT/EN/ES',()=>{
 const C=component()
 for (const [locale,count,none,inactive] of [['pt','2 ativas','Nenhuma','inativa'],['en','2 active','None','inactive'],['es','2 activas','Ninguna','inactiva']]) {
  const html=renderToStaticMarkup(React.createElement(C,{stageId:'stage',stageName:'Novo',state:ready,locale,returnTo:'/m/pipeline'}))
  assert.ok(html.includes(count));assert.ok(!html.includes(none));assert.ok(!html.includes(inactive))
  assert.equal((html.match(/<section/g)||[]).length,1,'empty automation group is absent')
  assert.ok(html.includes('edit=a'));assert.ok(html.includes('edit=b'));assert.ok(!html.includes('edit=c'))
  assert.ok(html.includes('/m/sequences?'));assert.ok(html.includes('returnTo=%2Fm%2Fpipeline'));assert.ok(!html.includes('checkbox'))
 }
})
test('both groups exclude inactive details and preserve exact desktop IDs without mutating metadata',()=>{
 const C=component()
 const state={...ready,stages:[{id:'stage',sequences:[item(false,'disabled-seq')],automations:[item(false,'disabled-auto'),item(true,'active-auto')]}]}
 const before=JSON.stringify(state)
 const html=renderToStaticMarkup(React.createElement(C,{stageId:'stage',stageName:'Novo',state,locale:'en',returnTo:'/dashboard/pipeline?pipeline=11111111-1111-1111-1111-111111111111'}))
 assert.ok(html.includes('Automation'));assert.ok(!html.includes('Sequence'))
 assert.ok(html.includes('/dashboard/automations?edit=active-auto&amp;returnTo=%2Fdashboard%2Fpipeline%3Fpipeline%3D11111111-1111-1111-1111-111111111111'))
 assert.ok(!html.includes('disabled-'));assert.equal(JSON.stringify(state),before)
})
test('empty and inactive-only real strips render no element or reserved space',()=>{
 const C=component()
 for (const locale of ['pt','en','es']) for(const items of [[],[item(false)]]) {
  const state={...ready,stages:[{id:'stage',sequences:items,automations:items}]}
  assert.equal(renderToStaticMarkup(React.createElement(C,{stageId:'stage',stageName:'Novo',state,locale})), '')
 }
})
test('loading, failure, restricted and unknown stage are not empty states or edit links',()=>{
 const C=component()
 for (const status of ['loading','error','restricted','unavailable','ready']) {
  const html=renderToStaticMarkup(React.createElement(C,{stageId:'missing',stageName:'Novo',state:{...ready,status},locale:'pt'}))
  assert.ok(!html.includes('Nenhuma'));assert.ok(!html.includes('edit='));assert.ok(!html.includes('Named action'))
  assert.equal((html.match(/role="status"/g)||[]).length,1,'one compact metadata status, not fictional action groups')
  assert.ok(!html.includes('Sequência ·'));assert.ok(!html.includes('Automação ·'));assert.ok(!html.includes('⚡'))
  if(status==='loading') { assert.ok(html.includes('class="sr-only"'));assert.ok(html.includes('aria-busy="true"'));assert.ok(!html.includes('<button')) }
  assert.ok(html.includes(status==='loading'?'Carregando':status==='restricted'?'Somente o dono':'Indisponível'))
 }
})
test('pseudo pipeline has an informational PT/EN/ES state, no empty counts, retry or edit',()=>{
 const C=component()
 for(const [locale,message] of [['pt','Não se aplica'],['en','Not applicable'],['es','No aplica']]){
  const html=renderToStaticMarkup(React.createElement(C,{stageId:'pseudo-member',stageName:'Assigned',state:{status:'not-applicable',pipelineId:'pseudo-pipe-member'},locale,onRetry:()=>{}}))
  assert.ok(html.includes(message));assert.ok(!html.includes('Nenhuma'));assert.ok(!html.includes('None'));assert.ok(!html.includes('Ninguna'))
  assert.ok(html.includes('ⓘ'));assert.ok(!html.includes('⚡'));assert.ok(!html.includes('Tentar novamente'));assert.ok(!html.includes('Try again'));assert.ok(!html.includes('Reintentar'));assert.ok(!html.includes('edit='));assert.ok(!html.includes('<summary'))
 }
})
test('safe return rejects arbitrary paths and only keeps known pipeline identity',()=>{
 const m=load(resolve('src/lib/pipeline-action-links.ts'))
 for(const path of ['https://evil.invalid','//evil.invalid','/dashboard/automations','/dashboard/pipeline/evil','/m/pipeline?next=https://evil.invalid']) assert.equal(m.safePipelineReturn(path),path.startsWith('/m/pipeline?')?'/m/pipeline':'/dashboard/pipeline')
 assert.equal(m.safePipelineReturn('/m/pipeline'),'/m/pipeline')
 assert.equal(m.resolveActionEdit('?edit=b',[{id:'a'},{id:'b'}])?.id,'b')
 assert.equal(m.resolveActionEdit('?edit=foreign',[{id:'a'}]),null)
})
