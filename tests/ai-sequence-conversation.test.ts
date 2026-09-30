import test from 'node:test'
import assert from 'node:assert/strict'
import { generateSequenceCopy } from '../src/lib/ai-sequence-copy'
import { defaultAIConfig } from '../src/lib/ai-sequence-config'

const config = {...defaultAIConfig, instructions:'Propósito: dar a melhor cotação de life insurance. Abordagem: peça retorno. Tom: simpático e persistente.'}
const fixture = (locale:string, body:string):typeof fetch => async()=>Response.json({choices:[{message:{content:JSON.stringify({locale,body})}}]})

test('generic commercial purpose does not force product repetition: short warm varied conversation guidance', async()=>{
 let payload:{messages:{content:string}[]} | undefined
 const safeBody='🙂 Você costuma conversar com sua família sobre planos para o futuro?'
 await generateSequenceCopy(config,{lead_language:'pt'},[],{key:'fixture',fetch:async(url,init)=>{
  payload=JSON.parse(String(init?.body));return fixture('pt',safeBody)(url,init)
 }})
 const system=payload!.messages[0].content
 const data=JSON.parse(payload!.messages[1].content)
 assert.equal(data.max_body_characters,180)
 assert.match(system,/100.?160/)
 assert.match(system,/one light emoji/i)
 assert.match(system,/explicit.*no.emoji/i)
 assert.match(system,/commercial purpose.*not.*repeat/i)
 assert.match(system,/previous_drafts.*outbound/i)
 assert.match(system,/different subject.*not.*synonym/i)
 assert.match(system,/family.*home.*United States.*future support.*reserves.*existing protection/i)
 assert.doesNotMatch(system,/question about family protection or familiarity with life insurance/)
 assert.equal(data.instructions,config.instructions)
})

test('prompt permits voluntary duration of US experience without invented scheduling',async()=>{
 let system=''
 await generateSequenceCopy({...config,instructions:'Pergunte voluntariamente há quanto tempo vive nos EUA.'},{lead_language:'pt'},[],{key:'fixture',fetch:async(url,init)=>{
  system=JSON.parse(String(init?.body)).messages[0].content
  return fixture('pt','🙂 Há quanto tempo você vive nos Estados Unidos?')(url,init)
 }})
 assert.doesNotMatch(system,/all date\/time words/i)
 assert.match(system,/voluntary.*duration.*United States/i)
 assert.match(system,/Do not invent.*dates, times, or confirmed appointments/i)
})

test('last three revalidated drafts retain legacy bodies up to 300 and ignore raw history', async()=>{
 const old='Contexto geral para uma conversa tranquila. '.repeat(5)+'Você já conhece as opções de proteção?'
 const valid=[old,'Você já tem proteção para sua família?','Você costuma conversar com sua família sobre planos?']
 let previous:string[]=[]
 await generateSequenceCopy(config,{lead_language:'pt'},[...valid.map(s=>'draft:v1:'+s),'raw inbox private@example.test','draft:v1:Qual sua renda?'],{key:'fixture',fetch:async(url,init)=>{
  previous=JSON.parse(JSON.parse(String(init?.body)).messages[1].content).previous_drafts
  return fixture('pt','🏡 Você tem algum plano para sua casa?')(url,init)
 }})
 assert.ok(old.length>180 && old.length<=300)
 assert.deepEqual(previous,valid)
 await assert.rejects(generateSequenceCopy(config,{lead_language:'pt'},[],{key:'fixture',fetch:fixture('pt',old)}),{reason:'length'})
})

const subjects={
 pt:['😊 Você costuma conversar com sua família sobre planos?', '🏡 Você tem algum plano para sua casa?', '🙂 Como você descreveria sua experiência nos Estados Unidos?', '💛 Você já pensou em quem poderia apoiar sua família no futuro?', '🌱 Você já tem uma reserva para imprevistos?', '🙂 Você já tem alguma proteção pessoal?'],
 es:['😊 ¿Qué planes te gustaría compartir con tu familia?', '🏡 ¿Qué te gustaría cambiar en tu casa?', '🙂 ¿Qué te gusta de tu vida en Estados Unidos?', '💛 ¿Ya tienes alguien que pueda apoyar a tu familia?', '🌱 ¿Ya tienes una reserva para imprevistos?', '🙂 ¿Ya tienes alguna protección personal?'],
 en:['😊 What would you like your family to plan together?', '🏡 What would you like to change about your home?', '🙂 How would you describe life in the United States?', '💛 Who could your family turn to for support?', '🌱 Do you have savings for your unexpected needs?', '🙂 Do you already have any personal protection?'],
}
for(const locale of ['pt','es','en'] as const) test(`consecutive distinct-topic fixtures ${locale}: rolling context and emoji, not provider quality`,async()=>{
 const recent:string[]=[]
 for(const body of subjects[locale]) {
  const result=await generateSequenceCopy(config,{lead_language:locale},recent,{key:'fixture',fetch:async(url,init)=>{
   const data=JSON.parse(JSON.parse(String(init?.body)).messages[1].content)
   assert.deepEqual(data.previous_drafts,recent.slice(-3).map(s=>s.slice(9)))
   return fixture(locale,body)(url,init)
  }})
  assert.equal(result.body,body)
  assert.equal((body.match(/\?/g)||[]).length,1)
  assert.ok(body.length<=180)
  recent.push(result.choice)
 }
 for(const instructions of ['', 'Sem emoji. Pergunte apenas sobre proteção existente.', 'No emoji. Ask only about existing protection.', 'Sin emoji. Pregunta solo sobre protección existente.']) {
  const body=subjects[locale].at(-1)!.slice(3)
  const result=await generateSequenceCopy({...config,instructions},{lead_language:locale},[],{key:'fixture',fetch:async(url,init)=>{
   const data=JSON.parse(JSON.parse(String(init?.body)).messages[1].content)
   assert.equal(data.instructions,instructions)
   return fixture(locale,body)(url,init)
  }})
  assert.equal(result.body,body)
 }
})

for(const [locale,body] of [
 ['pt','🙂 Quais valores você gostaria de transmitir à sua família?'],
 ['en','🙂 How do you balance your family priorities?'],
]) test(`nonfinancial family values and balancing priorities remain valid: ${locale}`,async()=>{
 const result=await generateSequenceCopy(config,{lead_language:locale},[],{key:'fixture',fetch:fixture(locale,body)})
 assert.equal(result.body,body)
})

test('new voluntary topics never collect balances, amounts, documents or immigration status, including replay',async()=>{
 const unsafe={pt:['Qual o saldo da sua reserva?', 'Qual o valor da sua reserva?', 'Quais valores você tem guardados?', 'Qual quantia você tem poupada?', 'Você pode enviar seus documentos?', 'Qual é o seu status migratório?'],es:['¿Cuál es el saldo de tu reserva?', '¿Cuál es el valor de tus ahorros?', '¿Puedes enviar tus documentos?', '¿Cuál es tu estatus migratorio?'],en:['What is your savings balance?', 'What balance do you have in your account?', 'What amounts do you have saved?', 'Can you send your documents?', 'What is your immigration status?']}
 for(const locale of ['pt','es','en'] as const) {
  for(const body of unsafe[locale]) {
   await assert.rejects(generateSequenceCopy(config,{lead_language:locale},[],{key:'fixture',fetch:fixture(locale,body)}),{code:'AI_INVALID_TEXT',reason:'private_data'})
  }
  await generateSequenceCopy(config,{lead_language:locale},unsafe[locale].map(body=>'draft:v1:'+body),{key:'fixture',fetch:async(url,init)=>{
   const data=JSON.parse(JSON.parse(String(init?.body)).messages[1].content)
   assert.deepEqual(data.previous_drafts,[])
   return fixture(locale,subjects[locale][0])(url,init)
  }})
 }
})


