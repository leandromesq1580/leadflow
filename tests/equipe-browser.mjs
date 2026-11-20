// Start a local Next server on 3337; uses mocked API, never creates real bookings.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const require=createRequire(process.env.EQUIPE_TEST_DEPS ? `${process.env.EQUIPE_TEST_DEPS}/package.json` : import.meta.url)
const {chromium}=require('playwright')
const browser=await chromium.launch({headless:true,executablePath:process.env.EQUIPE_CHROMIUM})
const checks=[]
try {
 for(const [lang,title,submit,success] of [['en','Schedule a call','Confirm booking','Your conversation is booked.'],['pt','Agendar uma conversa','Confirmar agendamento','Sua conversa está agendada.'],['es','Agendar una llamada','Confirmar cita','Tu conversación está agendada.']]) {
  const context=await browser.newContext({timezoneId:'America/New_York',viewport:{width:390,height:844}})
  const page=await context.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message))
  let posts=[],mode='success',gets=0
  const slots=['2026-11-23T12:00:00.000Z','2026-11-23T13:00:00.000Z']
  await page.route('**/api/equipe/agendar',async route=>{
   if(route.request().method()==='GET'){gets++;return route.fulfill({json:{slots}})}
   const data=route.request().postDataJSON();posts.push(data)
   if(mode==='conflict')return route.fulfill({status:409,json:{code:'slot_taken'}})
   if(mode==='error')return route.fulfill({status:503,json:{code:'unavailable'}})
   if(mode==='rate')return route.fulfill({status:429,json:{code:'rate_limited'}})
   return route.fulfill({json:{ok:true,slot:data.slot}})
  })
  await page.goto(`http://127.0.0.1:3337/equipe/${lang==='pt'?'':lang}?utm_source=browser-test&campaign_id=local`)
  assert.equal(await page.locator('a[href*="wa.me"]').count(),0)
  await page.getByRole('button',{name:new RegExp(title)}).filter({visible:true}).first().click()
  const dialog=page.getByRole('dialog'); await dialog.waitFor({state:'visible'})
  await page.locator('select[name=slot] option').nth(1).waitFor({state:'attached'})
  assert.equal(await page.locator('select[name=slot] option').nth(1).textContent(),lang==='en'?'7:00 AM':lang==='pt'?'7:00 AM':'7:00 a.m.')
  await page.locator('input[name=nome]').fill('Browser Test')
  await page.locator('input[name=email]').fill('browser@example.test')
  await page.locator('input[name=telefone]').fill('+12025550123')
  await page.locator('select[name=slot]').selectOption(slots[0])
  if(lang==='en') {
   for(const state of ['error','rate','conflict']) {
    mode=state;await page.getByRole('button',{name:submit,exact:true}).click()
    await dialog.getByRole('alert').waitFor({state:'visible'})
    assert.equal(await page.getByRole('heading',{name:success,exact:true}).count(),0)
    if(state==='conflict') {await page.waitForFunction(()=>document.querySelector('select[name=slot]').value==='');assert.ok(gets>=2)}
   }
   await page.locator('select[name=slot]').selectOption(slots[1]);mode='success'
  }
  await page.getByRole('button',{name:submit,exact:true}).click()
  await page.getByRole('heading',{name:success,exact:true}).waitFor({state:'visible'})
  assert.equal(posts.at(-1).fuso,'America/New_York'); assert.equal(posts.at(-1).idioma,lang)
  assert.equal(posts.at(-1).tracking.utm_source,'browser-test');assert.equal(posts.at(-1).tracking.campaign_id,'local')
  assert.ok(posts.at(-1).slot.endsWith('Z'))
  assert.deepEqual(errors,[])
  assert.ok(await dialog.evaluate(e=>e.getBoundingClientRect().width<=window.innerWidth))
  checks.push({lang,success:true,posts:posts.length,errors})
  await context.close()
 }
 console.log(JSON.stringify({passed:true,checks}))
}finally{await browser.close()}
