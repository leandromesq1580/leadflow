/* eslint-disable @typescript-eslint/no-explicit-any -- hook lifecycle fixture */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync,existsSync } from 'node:fs'
import ts from 'typescript'
import React from 'react'
import {renderToString} from 'react-dom/server'
import {usePipelineOrder} from '../src/lib/use-pipeline-order'

// Deterministic React lifecycle boundary; browser suite also mounts actual React.
function fixture() {
 const path='src/lib/use-pipeline-order.ts'
 assert.ok(existsSync(path),'ordering hook must exist')
 const slots:any[]=[],jobs:any[]=[],requests:any[]=[],listeners=new Map<string,Set<any>>()
 const storage=new Map<string,string>(),timers=new Map<number,()=>void>();let blocked=false,cursor=0,timerId=0
 const react={
  useRef:(value:any)=>{const i=cursor++;return slots[i]??(slots[i]={current:value})},
  useState:(initial:any)=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],(v:any)=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},
  useCallback:(fn:any)=>{cursor++;return fn},
  useEffect:(fn:any,deps:any[])=>{const i=cursor++,prev=slots[i];if(!prev||deps.some((d,j)=>d!==prev.deps[j]))jobs.push(()=>{prev?.cleanup?.();slots[i]={deps,cleanup:fn()}})},
 }
 const win={localStorage:{getItem:(k:string)=>{if(blocked)throw Error('Private');return storage.get(k)||null},setItem:(k:string,v:string)=>{if(blocked)throw Error('Private');storage.set(k,v)}},addEventListener:(n:string,f:any)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n)!.add(f)},removeEventListener:(n:string,f:any)=>listeners.get(n)?.delete(f)}
 const m={exports:{} as any}
 const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('require','module','exports','fetch','window','document','setInterval','clearInterval','setTimeout','clearTimeout',code)((name:string)=>{assert.equal(name,'react');return react},m,m.exports,(url:string,opts:any)=>new Promise(resolve=>requests.push({url,opts,resolve})),win,{visibilityState:'visible',addEventListener:win.addEventListener,removeEventListener:win.removeEventListener},()=>1,()=>{},(fn:()=>void)=>{const id=++timerId;timers.set(id,fn);return id},(id:number)=>timers.delete(id))
 const render=(id='11111111-1111-4111-8111-111111111111')=>{cursor=0;const r=m.exports.usePipelineOrder(id);jobs.splice(0).forEach(j=>j());return r}
 return {render,requests,storage,expire:()=>{const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn())},block:()=>{blocked=true},event:(name:string)=>listeners.get(name)?.forEach(f=>f()),flush:async()=>{for(let i=0;i<8;i++)await Promise.resolve()}}
}
test('a stalled metadata fetch becomes unavailable and can retry; late result cannot claim empty/ready',async()=>{
 const f=fixture();f.render();respond(f.requests[0],{auth_user_id:a});await f.flush();f.render().setMode('conversation');f.render()
 const old=f.requests[1];f.expire();let h=f.render();assert.equal(h.status,'error');assert.deepEqual(h.dates,{})
 h.retry();f.render();assert.equal(f.requests.length,3)
 respond(old,{auth_user_id:a,pipeline_id:pipeline,conversations:[]});await f.flush();h=f.render();assert.equal(h.status,'loading')
})
test('SSR defaults to newest without touching storage, cookies or window',()=>{
 function Probe(){const h=usePipelineOrder(null);return React.createElement('span',null,h.mode)}
 assert.equal(renderToString(React.createElement(Probe)),'<span>newest</span>')
})
const pipeline='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333'
const respond=(r:any,data:any,status=200)=>r.resolve(Response.json(data,{status}))
test('default newest; authenticated identity owns storage, private storage safe; metadata lazy',async()=>{
 const f=fixture();assert.equal(f.render().mode,'newest');assert.equal(f.requests.length,1)
 respond(f.requests[0],{auth_user_id:a});await f.flush();let hook=f.render()
 assert.equal(hook.mode,'newest');assert.equal(f.requests.length,1)
 hook.setMode('conversation');hook=f.render();assert.equal(hook.mode,'conversation')
 assert.equal(f.storage.get('l4p:pipeline-order:v1:'+a),'conversation');assert.equal(f.requests.length,2)
 f.block();assert.doesNotThrow(()=>hook.setMode('newest'))
})
test('switch pipeline invalidates late responses even if fetch ignores AbortSignal; retries coalesce',async()=>{
 const f=fixture();f.render();respond(f.requests[0],{auth_user_id:a});await f.flush();let h=f.render();h.setMode('conversation');f.render()
 const old=f.requests[1];f.render(b);assert.equal(f.requests.length,3)
 respond(f.requests[2],{auth_user_id:a,pipeline_id:b,conversations:[{lead_id:'new',last_whatsapp_at:null}]});await f.flush();h=f.render(b);assert.equal(h.status,'ready')
 respond(old,{auth_user_id:a,pipeline_id:pipeline,conversations:[{lead_id:'old',last_whatsapp_at:'2026-01-01'}]});await f.flush();h=f.render(b)
 assert.deepEqual(h.dates,{new:null});h.retry();h.retry();f.render(b);assert.ok(f.requests.length<=4)
})
test('account switch resets preference and rejects old identity metadata; pseudo does not query',async()=>{
 const f=fixture();f.render();respond(f.requests[0],{auth_user_id:a});await f.flush();f.render().setMode('conversation');f.render()
 respond(f.requests[1],{auth_user_id:b,pipeline_id:pipeline,conversations:[{lead_id:'secret',last_whatsapp_at:'2026-01-01'}]});await f.flush()
 let h=f.render();assert.notEqual(h.status,'ready');assert.deepEqual(h.dates,{})
 const x=fixture();x.render('pseudo-pipe-'+pipeline);respond(x.requests[0],{auth_user_id:a});await x.flush();x.render('pseudo-pipe-'+pipeline).setMode('conversation');h=x.render('pseudo-pipe-'+pipeline)
 assert.equal(h.status,'restricted');assert.equal(x.requests.length,1)
})
test('auth storage change bypasses focus cooldown and invalidates in-flight identity, not another account preference',async()=>{
 const f=fixture();f.render();const old=f.requests[0]
 f.event('storage');f.render();assert.equal(f.requests.length,2)
 respond(f.requests[1],{auth_user_id:b});await f.flush();f.render().setMode('conversation');f.render()
 respond(old,{auth_user_id:a});await f.flush();const h=f.render()
 assert.equal(h.mode,'conversation');assert.equal(f.storage.get('l4p:pipeline-order:v1:'+b),'conversation');assert.equal(f.storage.has('l4p:pipeline-order:v1:'+a),false)
})
