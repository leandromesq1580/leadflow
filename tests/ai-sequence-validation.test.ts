import test from 'node:test'
import assert from 'node:assert/strict'
import { generateSequenceCopy } from '../src/lib/ai-sequence-copy'
import { defaultAIConfig } from '../src/lib/ai-sequence-config'

// Synthetic valid copy, not captured provider output or evidence of production causes.
const topics = {
 pt: ['Como está a adaptação da família por aqui?', 'Tem algum plano para a casa?', 'Tem apoio por aqui?', 'Já tem alguma reserva para imprevistos?', 'Como está a vida por aqui nos EUA?'],
 es: ['¿Cómo va la adaptación de la familia por aquí?', '¿Tienes planes para tu casa?', '¿Tienes apoyo por aquí?', '¿Tienes ahorros para imprevistos?', '¿Cómo va la vida por aquí en Estados Unidos?'],
 en: ['How is family life here?', 'Any plans for the home?', 'Is support available here?', 'Do savings exist for emergencies?', 'How is life here in the United States?'],
}
const fixture = (locale:string, body:string):typeof fetch => async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({locale,body})}}]})
const generate = (locale:string, body:string) => generateSequenceCopy(defaultAIConfig,{lead_language:locale},[],{key:'fixture',fetch:fixture(locale,body)})
for (const locale of ['pt','es','en'] as const) for (const body of topics[locale]) {
 test(`short valid conversational vocabulary ${locale}: ${body}`,async()=>{
  assert.equal((await generate(locale,body)).body,body)
 })
}

for (const locale of ['pt','es','en'] as const) test(`wrong language and gibberish remain rejected ${locale}`,async()=>{
 for (const other of ['pt','es','en'] as const) if (other !== locale) {
  for (const body of topics[other]) await assert.rejects(generate(locale,body),{reason:'language'})
 }
 await assert.rejects(generate(locale,'Blorpt zqxw plimnar?'),{reason:'language'})
})

for (const locale of ['pt','es','en'] as const) test(`one light terminal emoji is safe ${locale}`,async()=>{
 for (const emoji of ['🙂','😊','💛','🏡','🌱']) for (const space of ['', ' ']) {
  const body=topics[locale][0]+space+emoji
  assert.equal((await generate(locale,body)).body,body)
 }
})

test('terminal emoji never licenses text, extra questions, extra emoji or unsafe content',async()=>{
 const base='Você já tem proteção para sua família?'
 for (const body of [base+' 😊 Obrigado',base+' 😊.',base+' 😊 Qual sua idade?',base+' 😊🙂','🙂 '+base+' 😊','🇧🇷 '+base+' 😊',base+' 🚀',base.replace('?','')+' 😊',base+' 😊 ligue para mim']) {
  await assert.rejects(generate('pt',body),{reason:'question_format'})
 }
 for (const [body,reason] of [
  [base+' 😊 https://example.test','contact_or_markup'],
  [base+' 😊 email@example.test','contact_or_markup'],
  ['Qual o saldo da sua reserva? 😊','private_data'],
  ['Sou humano. Você já tem proteção para sua família? 😊','claim_or_identity'],
  ['Podemos combinar uma ligação? 😊','goal'],
  ['Você já tem proteção e você gostaria de conversar? 😊','multiple_intents'],
 ]) await assert.rejects(generate('pt',body),{reason})
})

test('prompt unambiguously places the default emoji at the beginning',async()=>{
 let system=''
 await generateSequenceCopy(defaultAIConfig,{lead_language:'pt'},[],{key:'fixture',fetch:async(url,init)=>{
  system=JSON.parse(String(init?.body)).messages[0].content
  return fixture('pt',topics.pt[0])(url,init)
 }})
 assert.match(system,/one light emoji.*at the beginning/i)
 assert.match(system,/Do not put.*after the final question mark/i)
})

test('light emoji preserves explicit English permission, not calendar claims',async()=>{
 const config={...defaultAIConfig,instructions:'Invite directly to a call.'}
 const body='🙂 May I arrange a call with you?'
 assert.equal((await generateSequenceCopy(config,{lead_language:'en'},[],{key:'fixture',fetch:fixture('en',body)})).body,body)
 await assert.rejects(generateSequenceCopy(config,{lead_language:'en'},[],{key:'fixture',fetch:fixture('en','🙂 May I arrange a call with you tomorrow?')}),{reason:'claim_or_identity'})
})

test('foreign-language sentence mixed with a short locale token remains rejected',async()=>{
 for (const [locale,body] of [
  ['pt','Você, would you like your family to plan together?'],
  ['es','Tu, would you like your family to plan together?'],
  ['en','You, você gostaria de proteção para sua família?'],
 ]) await assert.rejects(generate(locale,body),{reason:'language'})
})
