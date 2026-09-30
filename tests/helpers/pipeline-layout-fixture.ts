/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated services; actual layouts execute. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
const native = createRequire(process.cwd() + '/package.json')
export function fixtureLayout(kind: 'm' | 'dashboard', ua: string, cookie: boolean, options = {authenticated:true,active:true,accepted:true}) {
 const pass = ({children}: any) => children
 const marker = (name: string) => function FixtureMarker() { return React.createElement('span',{hidden:true},name) }
 const db:any={from:()=>db,select:()=>db,eq:()=>db,single:async()=>({data:{id:'fixture',is_active:options.active,is_admin:false,crm_plan:'pro'}})}
 const deps:any={
  'next/navigation':{redirect:(path:string)=>{throw new Error(`redirect:${path}`)}},
  'next/headers':{headers:async()=>new Headers({'user-agent':ua}),cookies:async()=>({has:()=>cookie,get:()=>undefined})},
  '@/lib/supabase/server':{createServerSupabase:async()=>({auth:{getUser:async()=>({data:{user:options.authenticated?{id:'fixture'}:null}})}})},
  '@/lib/supabase/admin':{createAdminClient:()=>db},
  '@/lib/locale':{getLocale:async()=>'pt'},
  '@/lib/policies':{hasAcceptedCurrentPolicy:async()=>options.accepted},
  '@/lib/crm-access':{isTrialActive:()=>false,trialDaysRemaining:()=>0,isAppointmentOnly:()=>false,isLeadOnly:()=>false},
  '@/lib/policies-access':{podeVerApolices:async()=>false},
 }
 const m={exports:{} as any}
 const code=ts.transpileModule(readFileSync(`src/app/${kind}/layout.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('require','module','exports',code)((name:string)=>{
  if(name in deps)return deps[name]
  if(name.endsWith('.css'))return {}
  if(name.startsWith('@/'))return new Proxy({},{get:(_,key)=>String(key).endsWith('Provider')||String(key).endsWith('Gate')&&key!=='PolicyAcceptanceGate'?pass:marker(String(key))})
  return native(name)
 },m,m.exports)
 return m.exports.default
}
