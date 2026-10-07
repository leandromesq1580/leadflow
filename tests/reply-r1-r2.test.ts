/* eslint-disable @typescript-eslint/no-explicit-any -- offline transport and React hook boundary */
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {createClient} from '@supabase/supabase-js'
import {conversationOrderAPI} from '../src/lib/pipeline-conversation-api'

const buyer='11111111-1111-4111-8111-111111111111', pipeline='22222222-2222-4222-8222-222222222222'
const owner={id:'lead',assigned_to:buyer,assigned_to_member:null}
const message=(id:string,changes:Record<string,any>={})=>({id,buyer_id:buyer,lead_id:'lead',sent_at:'2026-10-07T12:00:00+00:00',direction:'in',status:'delivered',body:'real',media_type:null,media_url:null,wa_message_id:'false_fixture',...changes})
function transport(rows:any[],options:{cap?:number;stuck?:boolean;fail?:boolean;revoke?:boolean}={}) {
 const urls:URL[]=[];let transferred=0
 const db=createClient('http://fixture.invalid','fixture',{auth:{persistSession:false},global:{fetch:async(input:any)=>{
  const u=new URL(input);urls.push(u);const table=u.pathname.split('/').at(-1)
  if(table==='pipelines')return Response.json({id:pipeline})
  if(table==='pipeline_leads')return Response.json(u.searchParams.has('id')?[]:[{id:'card',lead:owner}])
  const follow=table==='whatsapp_messages'
  if(follow&&options.fail)return Response.json({message:'synthetic failure'},{status:503})
  if(table==='leads'&&u.searchParams.getAll('id').some(v=>v.startsWith('gt.')))return Response.json([])
  if(table==='leads'||follow){
   let selected=rows.slice()
   for(const [key,expression] of u.searchParams){
    const field=follow?key:key.startsWith('whatsapp_messages.')?key.slice(18):''
    if(!field||['order','limit','select','offset'].includes(field))continue
    const dot=expression.indexOf('.'), op=expression.slice(0,dot), value=expression.slice(dot+1)
    if(options.stuck&&follow&&['lt','eq'].includes(op)&&['id','sent_at'].includes(field))continue
    if(op==='eq')selected=selected.filter(r=>r[field]===value)
    else if(op==='lt')selected=selected.filter(r=>r[field]<value)
    else if(op==='in')selected=selected.filter(r=>value.slice(1,-1).split(',').includes(r[field]))
    else if(op==='not'&&value==='is.null')selected=selected.filter(r=>r[field]!=null)
    else throw Error('Unsupported fixture operator '+field+':'+expression)
   }
   selected.sort((a,b)=>b.sent_at.localeCompare(a.sent_at)||b.id.localeCompare(a.id))
   const limit=Number(u.searchParams.get(follow?'limit':'whatsapp_messages.limit'))
   selected=selected.slice(0,Math.min(limit,options.cap??1000));transferred+=selected.length
   if(follow)return Response.json(selected)
   const delegated=options.revoke&&urls.some(url=>url.pathname.endsWith('/whatsapp_messages'))
   return Response.json([{...owner,assigned_to:delegated?'foreign':buyer,whatsapp_messages:selected}])
  }
  throw Error('Unexpected table '+table)
 }}})
 return {urls,db,get transferred(){return transferred}}
}
async function run(f:ReturnType<typeof transport>){return conversationOrderAPI(f.db,async()=>({id:buyer,authUserId:'auth'}))(new Request('http://fixture.invalid/?pipeline_id='+pipeline))}

test('R1 actual API ignores later empty/own echo; preserves inbound media and real outbound',async()=>{
 for(const valid of [{body:'text'},{body:'',media_type:'ptt'},{body:'sent',direction:'out',wa_message_id:'true_sent'}]){
  const f=transport([message('01',valid),message('02',{body:'echo',wa_message_id:'true_echo',sent_at:'2026-10-07T12:01:00+00:00'}),message('03',{body:' ',sent_at:'2026-10-07T12:02:00+00:00'})])
  const r=await run(f);assert.equal(r.status,200)
  assert.equal((await r.json()).conversations[0].last_whatsapp_at,'2026-10-07T12:00:00+00:00')
 }
})
test('R1 short server pages and tied timestamps do not hide previous valid message',async()=>{
 const f=transport([message('01'),...Array.from({length:6},(_,i)=>message(String(i+2).padStart(2,'0'),{body:''}))],{cap:1})
 const r=await run(f);assert.equal(r.status,200);assert.equal((await r.json()).conversations[0].last_whatsapp_at,'2026-10-07T12:00:00+00:00')
 assert.ok(f.urls.some(u=>u.pathname.endsWith('/whatsapp_messages')&&u.searchParams.get('id')?.startsWith('lt.')),'must continue the actual returned cursor')
 assert.ok(f.urls.filter(u=>u.pathname.endsWith('/whatsapp_messages')).every(u=>u.searchParams.get('buyer_id')==='eq.'+buyer&&u.searchParams.get('lead_id')==='eq.lead'))
})
test('R1 clean large history keeps one-row batched fast path',async()=>{
 const f=transport(Array.from({length:10000},(_,i)=>message(String(i).padStart(6,'0'))))
 assert.equal((await run(f)).status,200);assert.equal(f.transferred,1)
 assert.ok(!f.urls.some(u=>u.pathname.endsWith('/whatsapp_messages')))
 const u=f.urls.find(u=>u.pathname.endsWith('/leads'))!
 assert.equal(u.searchParams.get('whatsapp_messages.order'),'sent_at.desc.nullsfirst,id.desc')
})
test('R1 noise-only exhaustion returns null, failure/nonprogress/budget fail closed',async()=>{
 const f=transport([message('01',{body:''})],{cap:1});const r=await run(f)
 assert.equal(r.status,200);assert.equal((await r.json()).conversations[0].last_whatsapp_at,null)
 for(const options of [{stuck:true},{fail:true}])assert.equal((await run(transport([message('02',{body:''})],options))).status,503)
 const many=transport(Array.from({length:3000},(_,i)=>message(String(i).padStart(5,'0'),{body:''})),{cap:1})
 assert.equal((await run(many)).status,503);assert.ok(many.urls.length<60,'bounded work, not all history')
})
test('R1 ownership revoked during fallback is revalidated after messages',async()=>{
 const f=transport([message('01'),message('02',{body:'',sent_at:'2026-10-07T12:01:00+00:00'})],{revoke:true})
 const r=await run(f);assert.equal(r.status,200);assert.deepEqual((await r.json()).conversations,[])
})

// Execute the REAL component/effects with synthetic React and HTTP boundaries.
function topbar(){
 const states:any[]=[],effects:any[]=[],pending:(()=>void)[]=[];let index=0,round=0,failOther=false
 const timers=new Set<()=>Promise<void>>();let tree:any
 const react={useState(initial:any){const i=index++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],(v:any)=>{states[i]=typeof v==='function'?v(states[i]):v}]},useRef(){const i=index++;return states[i]??(states[i]={current:null})},useEffect(fn:any,deps:any[]){const i=index++;if(!effects[i]||JSON.stringify(effects[i].deps)!==JSON.stringify(deps)){effects[i]?.cleanup?.();effects[i]={deps};pending.push(()=>{effects[i].cleanup=fn()})}}}
 const jsx=(type:any,props:any)=>typeof type==='function'?type(props):({type,props})
 const fakeFetch=async(url:string)=>{
  if(url==='/api/home')return Response.json({remaining:3})
  if(url.includes('/whatsapp/unread'))return round===1?Response.json({error:'unavailable'},{status:503}):Response.json({total:round===0?7:0})
  if(failOther&&url.includes('/community/'))throw Error('network synthetic')
  return Response.json(url.includes('/community/')?{unread:2}:url.includes('/appointments/')?{events:[]}:{leads:[]})
 }
 const deps:Record<string,any>={react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'next/link':{default:'link'},'next/navigation':{usePathname:()=>'/dashboard'},'@/lib/i18n-client':{useT:()=>({_locale:'pt',sidebar:{}})},'@/components/locale-switcher':{LocaleSwitcher:'locale'}}
 const code=ts.transpileModule(readFileSync('src/components/dashboard/topbar.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
 const m={exports:{} as any};const noop=()=>{}
 new Function('require','module','exports','fetch','setInterval','clearInterval','window','document',code)((n:string)=>{assert.ok(n in deps,n);return deps[n]},m,m.exports,fakeFetch,(fn:any)=>{timers.add(fn);return fn},(fn:any)=>timers.delete(fn),{addEventListener:noop,removeEventListener:noop},{addEventListener:noop,removeEventListener:noop})
 const render=(id='buyer')=>{index=0;tree=m.exports.TopBar({buyerId:id});return tree}
 const flush=async()=>{while(pending.length)pending.shift()!();for(let i=0;i<20;i++)await Promise.resolve()}
 const text=(node:any):string=>node==null?'':typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(' '):text(node.props?.children)
 const nodes=(node:any):any[]=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)]
 return {render,flush,text:()=>text(tree),nodes:()=>nodes(tree),setRound(n:number){round=n},failOther(){failOther=true},async poll(){for(const fn of timers)await fn();await flush()},open(){nodes(tree).find(n=>n.type==='button').props.onClick();render()}}
}
test('R2 actual component keeps unread after 503, recovers to valid zero, independent counters survive',async()=>{
 const h=topbar();h.render();await h.flush();h.render();h.open();assert.match(h.text(),/7/)
 h.setRound(1);h.failOther();await h.poll();h.render();assert.match(h.text(),/7/);assert.match(h.text(),/indispon|atualiz/i);assert.doesNotMatch(h.text(),/Tudo em dia/)
 h.setRound(2);await h.poll();h.render();assert.doesNotMatch(h.text(),/7/);assert.match(h.text(),/2/,'community last count survives its own failure')
})
test('R2 first failed read and buyer switch never show all caught up or old buyer count',async()=>{
 const h=topbar();h.setRound(1);h.render();await h.flush();h.render();h.open();assert.doesNotMatch(h.text(),/Tudo em dia/);assert.match(h.text(),/indispon|atualiz/i)
 h.setRound(0);await h.poll();h.render();assert.match(h.text(),/7/)
 h.setRound(1);h.render('new-buyer');assert.doesNotMatch(h.text(),/7/,'old count must not flash before effect');await h.flush();h.render('new-buyer');assert.doesNotMatch(h.text(),/7/)
})
