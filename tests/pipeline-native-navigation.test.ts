/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated server layout dependencies; actual routing/layout code executes. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {createRequire} from 'node:module'
import {buildSync} from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextRequest } from 'next/server'
import { proxy } from '../src/proxy'
import { actionEditHref } from '../src/lib/pipeline-action-links'
import { fixtureLayout as layout } from './helpers/pipeline-layout-fixture'

for(const kind of ['sequences','automations'] as const) {
 for(const signal of ['ua','cookie'] as const) {
  test(`native ${signal}: ${kind} link traverses actual proxy and mobile layout, retaining ID/return`,async()=>{
   const href=actionEditHref(kind,'chosen-id','/m/pipeline?pipeline=11111111-1111-1111-1111-111111111111&next=https://evil.invalid')
   const url=new URL(href,'https://fixture.invalid')
   const headers:Record<string,string>=signal==='ua'?{'user-agent':'Lead4ProApp iOS'}:{cookie:'l4p_app=1'}
   const response=proxy(new NextRequest(url,{headers}))
   assert.equal(response.headers.get('location'),null,'editor must not redirect to /m')
   assert.equal(url.pathname,`/m/${kind}`)
   assert.equal(url.searchParams.get('edit'),'chosen-id')
   assert.equal(url.searchParams.get('returnTo'),'/m/pipeline?pipeline=11111111-1111-1111-1111-111111111111')
   // A page belongs to its filesystem layout; importing the existing editor does not import dashboard layout.
   assert.ok(readFileSync(`src/app/m/${kind}/page.tsx`,'utf8'))
   const html=renderToStaticMarkup(await layout('m',headers['user-agent']||'',signal==='cookie')({children:React.createElement('span',null,`editor:${kind}`)}))
   assert.ok(html.includes(`editor:${kind}`));assert.ok(html.includes('MobileBottomNav'));assert.ok(!html.includes('ResumeCheckout'))
   for(const forbidden of [`/dashboard/${kind}`,'/dashboard/credits','/onboarding']) {
    assert.equal(new URL(proxy(new NextRequest(new URL(forbidden,url),{headers})).headers.get('location')!).pathname,'/m')
   }
   if(signal==='ua')await assert.rejects(()=>layout('dashboard','Lead4ProApp',false)({children:'editor'}),/redirect:\/m$/)
  })
 }
}
test('mobile menu reaches the shared automation editor and the old Portuguese path remains compatible',()=>{
 assert.ok(readFileSync('src/app/m/mais/page.tsx','utf8').includes("href: '/m/automations'"))
 assert.ok(readFileSync('src/app/m/automacoes/page.tsx','utf8').includes("from '../automations/page'"))
})
test('shared mobile editor routes render on the server without window or search-param suspense bailouts',()=>{
 const native=createRequire(import.meta.url)
 for(const kind of ['sequences','automations','automacoes']){
  const {outputFiles}=buildSync({stdin:{contents:`export {default as Page} from './src/app/m/${kind}/page'; export {I18nProvider} from './src/lib/i18n-client'`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic'})
  const m={exports:{} as any}
  new Function('require','module','exports',outputFiles[0].text)(native,m,m.exports)
  const html=renderToStaticMarkup(React.createElement(m.exports.I18nProvider,{locale:'pt'},React.createElement(m.exports.Page)))
  assert.ok(html.includes('Carregando'));assert.ok(html.includes('m-pad'))
  assert.ok(html.includes('data-theme="dark"'),'reuse the full dark token palette, including nested select and semantic panel backgrounds')
  assert.ok(!html.includes('/dashboard/credits'));assert.ok(!html.includes('checkout'))
 }
})
test('mobile editors inherit authentication, suspension and terms gates',async()=>{
 await assert.rejects(()=>layout('m','Lead4ProApp',true,{authenticated:false,active:true,accepted:true})({children:'editor'}),/redirect:\/m-login/)
 for(const [options,expected] of [[{authenticated:true,active:false,accepted:true},'SuspendedAccount'],[{authenticated:true,active:true,accepted:false},'PolicyAcceptanceGate']] as const){
  const html=renderToStaticMarkup(await layout('m','Lead4ProApp',true,options)({children:'editor'}))
  assert.ok(html.includes(expected));assert.ok(!html.includes('editor'))
 }
})
