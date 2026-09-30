import test from 'node:test'
import assert from 'node:assert/strict'
import { generateSequenceCopy } from '../src/lib/ai-sequence-copy'
import { defaultAIConfig } from '../src/lib/ai-sequence-config'

const openings = {
 pt: 'Você já tem alguma proteção para sua família aqui nos Estados Unidos?',
 es: '¿Ya tienes alguna protección para tu familia aquí en Estados Unidos?',
 en: 'Do you already have any protection for your family here in the United States?',
}
const fixture = (locale:string, body:string):typeof fetch => async()=>Response.json({choices:[{message:{content:JSON.stringify({locale,body})}}]})
for (const locale of ['pt','es','en'] as const) for (const goal of ['call','meeting'] as const) for (const instructions of ['', 'Faça uma pergunta natural sobre proteção familiar, com tom acolhedor.']) {
 test(`engagement ${locale}/${goal}/${instructions ? 'guided' : 'default'} accepts a question without forcing the final goal or booking link`,async()=>{
  const c={...defaultAIConfig,goal,instructions,booking_url:'https://calendar.example.test/book'}
  let payload:{messages:{content:string}[]} | undefined
  const result=await generateSequenceCopy(c,{lead_language:locale},[],{key:'fixture',fetch:async(url,init)=>{
   payload=JSON.parse(String(init?.body));return fixture(locale,openings[locale])(url,init)
  }})
  assert.equal(result.body,openings[locale])
  assert.equal(result.choice,'draft:v1:'+openings[locale])
  const data=JSON.parse(payload!.messages[1].content)
  assert.equal(data.goal,goal)
  assert.equal(data.required_goal_word,undefined)
  assert.equal(data.instructions,instructions)
  assert.match(payload!.messages[0].content,/engagement-first/i)
  assert.doesNotMatch(JSON.stringify(payload),/calendar\.example/)
 })
}

const invitations={pt:'Podemos combinar uma ligação?',es:'¿Podemos coordinar una llamada?',en:'Would you like a call?'}
const directives={pt:'Convide diretamente para uma ligação.',es:'Invita directamente a una llamada.',en:'Invite directly to a call.'}
for (const locale of ['pt','es','en'] as const) {
 test(`direct invitation needs explicit affirmative instruction ${locale}`,async()=>{
  for(const instructions of ['', 'Não convide diretamente para uma ligação.', 'Do not invite directly to a call.', 'No invita directamente a una llamada.']) {
   await assert.rejects(generateSequenceCopy({...defaultAIConfig,instructions},{lead_language:locale},[],{key:'fixture',fetch:fixture(locale,invitations[locale])}),{code:'AI_INVALID_TEXT',reason:'goal'})
  }
  assert.equal((await generateSequenceCopy({...defaultAIConfig,instructions:directives[locale]},{lead_language:locale},[],{key:'fixture',fetch:fixture(locale,invitations[locale])})).body,invitations[locale])
 })
}
const contextual={
 pt:['Você já conhece o life insurance daqui ou ainda não teve oportunidade de entender como funciona?', 'Qual sua idade?', 'Você é casado atualmente?', 'Há quanto tempo você mora nos Estados Unidos?'],
 es:['¿Ya conoces el life insurance de aquí?', '¿Cuál es tu edad?', '¿Estás casado actualmente?', '¿Cuánto tiempo llevas en Estados Unidos?'],
 en:['Do you know how life insurance works here?', 'How old are you?', 'Are you married?', 'How long have you lived in the United States?'],
}
for(const locale of ['pt','es','en'] as const) test(`short voluntary contextual questions ${locale}`,async()=>{
 for(const body of contextual[locale]) assert.equal((await generateSequenceCopy({...defaultAIConfig,instructions:'Faça uma pergunta voluntária geral sobre idade, estado civil ou tempo nos EUA, sem afirmar fatos pessoais.'},{lead_language:locale},[],{key:'fixture',fetch:fixture(locale,body)})).body,body)
})

test('engagement history is revalidated, sent as drafts only and deduplicated',async()=>{
 const body=openings.pt
 let data:{previous_drafts:string[]}|undefined
 const recent=['raw private history','draft:v1:Qual sua idade?','draft:v1:'+body]
 await assert.rejects(generateSequenceCopy(defaultAIConfig,{lead_language:'pt'},recent,{key:'fixture',fetch:async(url,init)=>{
  data=JSON.parse(JSON.parse(String(init?.body)).messages[1].content)
  return fixture('pt',body.toUpperCase())(url,init)
 }}),{code:'AI_REPEATED_TEXT'})
 assert.deepEqual(data?.previous_drafts,['Qual sua idade?',body])
})
test('engagement keeps privacy, agenda, voice, goal and URL safety',async()=>{
 for(const body of ['Qual sua saúde?', 'Qual sua renda?', 'Qual seu SSN?', 'Você quer proteção? Qual sua idade?', 'Sou sua corretora. Você quer proteção?', 'Sua reunião está agendada hoje. Você quer proteção?']) {
  await assert.rejects(generateSequenceCopy(defaultAIConfig,{lead_language:'pt'},[],{key:'fixture',fetch:fixture('pt',body)}))
 }
 for(const booking_url of ['javascript:alert(1)','https://127.0.0.1/book','https://user:pass@example.test/book']) {
  let calls=0
  await assert.rejects(generateSequenceCopy({...defaultAIConfig,goal:'meeting',booking_url},{lead_language:'pt'},[],{key:'fixture',fetch:async()=>{calls++;return Response.json({})}}))
  assert.equal(calls,0)
 }
})

for(const locale of ['pt','es','en'] as const) test(`explicit meeting invitation link versus engagement ${locale}`,async()=>{
 const instructions={pt:'Convide diretamente para uma reunião.',es:'Invita directamente a una reunión.',en:'Invite directly to a meeting.'}[locale]
 const body={pt:'Podemos combinar uma reunião?',es:'¿Podemos coordinar una reunión?',en:'Would you like a meeting?'}[locale]
 const booking_url='https://calendar.example.test/book'
 const c={...defaultAIConfig,goal:'meeting' as const,instructions,booking_url}
 assert.equal((await generateSequenceCopy(c,{lead_language:locale},[],{key:'fixture',fetch:fixture(locale,body)})).body,body+' '+booking_url)
 assert.equal((await generateSequenceCopy(c,{lead_language:locale},[],{key:'fixture',fetch:fixture(locale,openings[locale])})).body,openings[locale])
 await assert.rejects(generateSequenceCopy(c,{lead_language:locale},[],{key:'fixture',fetch:fixture(locale,invitations[locale])}),{reason:'goal'})
})
