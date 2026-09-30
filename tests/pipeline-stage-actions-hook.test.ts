/* eslint-disable @typescript-eslint/no-explicit-any -- Hook effect boundary fixture; browser suite also mounts React. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

function hook() {
 const requests:string[]=[]; const effects:(()=>void)[]=[]; const listeners=new Map<string,()=>void>(); const states:any[]=[]
 let cursor=0
 const m={exports:{} as any}
 const code=ts.transpileModule(readFileSync('src/lib/use-stage-actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('require','module','exports','fetch','window',code)((n:string)=>{
  assert.equal(n,'react')
  return {useCallback:(fn:any)=>fn,useEffect:(fn:any)=>effects.push(fn),useState:(initial:any)=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],(value:any)=>{states[i]=typeof value==='function'?value(states[i]):value}]}}
 },m,m.exports,(url:string)=>{requests.push(url);return new Promise(()=>{})},{addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn),removeEventListener:(name:string)=>listeners.delete(name)})
 return {requests,listeners,render:(id:string|null)=>{cursor=0;effects.length=0;const result=m.exports.useStageActions(id);effects.splice(0).forEach(fn=>fn());return result}}
}
test('legitimate pseudo pipelines are informative without metadata requests or retry traffic',()=>{
 const f=hook(),id='pseudo-pipe-11111111-1111-1111-1111-111111111111'
 let result=f.render(id)
 assert.equal(result.state.status,'not-applicable')
 assert.equal(result.state.pipelineId,id)
 assert.deepEqual(f.requests,[])
 result.retry();f.listeners.get('focus')?.();result=f.render(id)
 assert.equal(result.state.status,'not-applicable');assert.deepEqual(f.requests,[])
})
test('unknown malformed pipeline identities never query metadata or claim no automations',()=>{
 for(const id of ['not-a-uuid','pseudo-pipe-',null]) {
  const f=hook();const result=f.render(id)
  assert.notEqual(result.state.status,'ready');assert.notEqual(result.state.status,'not-applicable')
  result.retry();f.listeners.get('focus')?.();f.render(id)
  assert.deepEqual(f.requests,[])
 }
})
test('switching from a real pipeline to pseudo does not leak old metadata; real UUIDs still load',()=>{
 const f=hook();const id='11111111-1111-1111-1111-111111111111'
 assert.equal(f.render(id).state.status,'loading');assert.equal(f.requests.length,1)
 assert.equal(f.render('pseudo-pipe-'+id).state.status,'not-applicable');assert.equal(f.requests.length,1)
})
