// Local Next UI + REAL POST handler/validation, only persistence mocked. No network writes.
// node --import tsx tests/equipe-phone-browser.mjs
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript'
import * as scheduling from '../src/lib/equipe-booking.ts'
const require = createRequire(`${process.env.EQUIPE_TEST_DEPS}/package.json`)
const { chromium } = require('playwright')
const browser = await chromium.launch({headless:true,executablePath:process.env.EQUIPE_CHROMIUM})
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-only'
let committed = [], mode = ''
const api = {}
const source = transpileModule(readFileSync('src/app/api/equipe/agendar/route.ts','utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText
new Function('require','exports',source)(name => name==='node:crypto' ? {createHmac} : name.includes('supabase') ? {createAdminClient:()=>({rpc:async (_name,args)=>{if(mode)return {error:{message:mode}};committed.push(args.p);return {data:{ok:true,slot:args.p.slot}}}})} : scheduling,api)
const results=[]
try {
 for(const [lang,title,submit,success] of [['en','Schedule a call','Confirm booking','Your conversation is booked.'],['pt','Agendar uma conversa','Confirmar agendamento','Sua conversa está agendada.'],['es','Agendar una llamada','Confirmar cita','Tu conversación está agendada.']]) {
  const context=await browser.newContext({timezoneId:'America/New_York',viewport:{width:390,height:844}})
  const page=await context.newPage(), errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  const slots=scheduling.availableSlots(new Date()).slice(0,2)
  await page.route('**/api/equipe/agendar',async route=>{
   if(route.request().method()==='GET')return route.fulfill({json:{slots}})
   const response=await api.POST(new Request('http://127.0.0.1:3338/api/equipe/agendar',{method:'POST',headers:{origin:'http://127.0.0.1:3338','content-type':'application/json'},body:route.request().postData()}))
   return route.fulfill({status:response.status,json:await response.json()})
  })
  await page.goto(`http://127.0.0.1:3338/equipe/${lang==='pt'?'':lang}?utm_source=local-test`)
  await page.getByRole('button',{name:new RegExp(title)}).filter({visible:true}).first().click()
  const dialog=page.getByRole('dialog')
  await page.locator('select[name=slot] option').nth(1).waitFor({state:'attached'})
  assert.equal(await page.locator('[name=country]').inputValue(),'US')
  await page.locator('[name=nome]').fill('Test Agent')
  await page.locator('[name=email]').fill('test@example.test')
  await page.locator('[name=telefone]').fill('(202) 555-0123')
  await page.locator('[name=slot]').selectOption(slots[0])
  for(const [field,bad,good] of [['nome',' ','Test Agent'],['email','bad','test@example.test'],['telefone','1111111111','(202) 555-0123']]) {
   const before=committed.length
   await page.locator(`[name=${field}]`).fill(bad)
   await page.getByRole('button',{name:submit,exact:true}).click()
   await page.locator(`#eq-error-${field}`).waitFor({state:'visible'})
   assert.equal(await page.locator(`[name=${field}]`).getAttribute('aria-invalid'),'true')
   assert.equal(committed.length,before)
   await page.locator(`[name=${field}]`).fill(good)
  }
  mode='slot_taken'
  await page.getByRole('button',{name:submit,exact:true}).click()
  await page.locator('#eq-error-slot').waitFor({state:'visible'})
  await page.waitForFunction(()=>document.querySelector('[name=slot]').value==='')
  await page.locator('[name=slot]').selectOption(slots[0]);mode=''
  await page.getByRole('button',{name:submit,exact:true}).click()
  await page.getByRole('heading',{name:success,exact:true}).waitFor({state:'visible'})
  assert.equal(committed.at(-1).telefone,'+12025550123')
  assert.equal(committed.at(-1).idioma,lang)
  assert.equal(committed.at(-1).tracking.utm_source,'local-test')
  assert.deepEqual(errors,[])
  assert.ok(await dialog.evaluate(e=>e.getBoundingClientRect().width<=window.innerWidth))
  for (const [country,phone,normalized] of [['US','+44 20 7946 0018','+442079460018'],['BR','(11) 91234-5678','+5511912345678'],['US','+1 (202) 555-0123','+12025550123']]) {
   await page.reload()
   await page.getByRole('button',{name:new RegExp(title)}).filter({visible:true}).first().click()
   await page.locator('select[name=slot] option').nth(1).waitFor({state:'attached'})
   await page.locator('[name=nome]').fill('Test Agent')
   await page.locator('[name=email]').fill('test@example.test')
   await page.locator('[name=country]').selectOption(country)
   await page.locator('[name=telefone]').fill(phone)
   await page.locator('[name=slot]').selectOption(slots[0])
   await page.getByRole('button',{name:submit,exact:true}).click()
   await page.getByRole('heading',{name:success,exact:true}).waitFor({state:'visible'})
   assert.equal(committed.at(-1).telefone,normalized)
  }
  assert.deepEqual(errors,[])
  results.push({lang,fieldErrors:true,conflict:true,nationalPhoneSuccess:true,internationalAndSelectedCountry:true})
  await context.close()
 }
 console.log(JSON.stringify({passed:true,results,localMockCommits:committed.length}))
} finally {await browser.close()}
