import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {readFileSync} from 'node:fs'
import {transpileModule,ModuleKind,ScriptTarget,JsxEmit} from 'typescript'
import * as diagnostics from '../src/lib/ai-sequence-diagnostics'
function render(stop_reason:string,status='active') {
 let n=0
 const react={...React,default:React,useState:(initial:unknown)=>[n++===0?[{id:'fixture',status,stop_reason,generation_status:'failed',delivery_status:'pending',attempts:1,last_sent_at:null,next_run_at:'2026-09-29T15:05:00Z',current_step:0}]:initial,()=>{}],useEffect:()=>{},useCallback:(fn:unknown)=>fn}
 const exports:Record<string,React.ComponentType<{sequenceId:string;enabled:boolean}>>={}
 new Function('require','exports',transpileModule(readFileSync('src/components/sequence-enrollment-panel.tsx','utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022,jsx:JsxEmit.React}}).outputText)((name:string)=>name==='react'?react:name.includes('diagnostics')?diagnostics:{},exports)
 return renderToStaticMarkup(React.createElement(exports.SequenceEnrollmentPanel,{sequenceId:'fixture',enabled:true}))
}
test('persisted generation reason renders human status, attempt and honest next attempt, including old rows',()=>{
 const html=render('AI_INVALID_TEXT:goal')
 for(const text of ['Resposta IA inválida','objetivo','Tentativa','1/3','Último envio','Nenhum envio confirmado','Próxima tentativa','não garante envio'])assert.ok(html.includes(text),text)
 assert.ok(!html.includes('AI_INVALID_TEXT'))
 assert.match(render('generation_unavailable'),/Falha de geração.*sem diagnóstico detalhado/)
 assert.ok(!render('PRIVATE ARBITRARY ERROR').includes('PRIVATE ARBITRARY ERROR'))
 assert.ok(!render('delivery_unknown','paused').includes('09/29/2026'))
})
