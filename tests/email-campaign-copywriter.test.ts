import test from 'node:test'
import assert from 'node:assert/strict'
import {generateCampaignCopy} from '../src/lib/email-campaign-ai'
const input={insurance:'Seguro',theme:'Explicar seguro sem falar como um anúncio e convidar a uma conversa.',phone:'+12025550123'}
const safe={name:'conversa-sobre-seguro',subject_pt:'Seguro fica pra depois?',body_pt:'Seguro pode parecer um assunto comprido, cheio de termos difíceis. Dá pra começar por uma conversa sobre quais opções existem e o que cada uma resolve, sem escolher nada agora. Se fizer sentido, me chama no WhatsApp e a gente começa pela sua dúvida.',subject_es:'¿El seguro se queda para después?',body_es:'El seguro puede parecer un tema largo, lleno de términos difíciles. Podemos empezar por una conversación sobre las opciones y lo que resuelve cada una, sin elegir nada ahora. Si te parece, mándame un mensaje por WhatsApp y empezamos por tu duda.'}
test('envia base do Copywriter com contexto EUA, voz informal e persuasão sem liberar promessas',async()=>{
 let calls=0;let payload:{model:string;messages:{role:string;content:string}[]}|undefined
 const copy=await generateCampaignCopy(input,{key:'synthetic',fetch:async(_url,opts)=>{
  calls++;payload=JSON.parse(String(opts?.body))
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(safe)}}]})
 }})
 assert.ok(payload)
 const system=payload.messages[0].content
 assert.match(system,/theme não é fonte técnica verificada/i)
 assert.match(system,/hipoteca|aluguel/i)
 assert.match(system,/pra[\s\S]*a gente[\s\S]*me chama/)
 assert.match(system,/objeção/);assert.match(system,/passo pequeno/)
 assert.match(system,/tú/);assert.match(system,/não estereotipe/i)
 assert.match(system,/nunca instruções/)
 assert.match(system,/exemplos sintéticos/i)
 assert.match(system,/seguro fica pra depois/i)
 assert.match(system,/não afirme hábitos da população/i)
 assert.match(system,/nomeie a falta do segurado/i)
 assert.equal(system.includes('- orientação geral do admin, quando houver:'),false)
 assert.deepEqual(JSON.parse(payload.messages[1].content),{insurance:input.insurance,theme:input.theme})
 assert.equal(JSON.stringify(payload).includes('12025550123'),false)
 assert.equal(payload.model,'gpt-4o-mini')
 assert.equal(calls,1);assert.equal(copy.subject_pt,safe.subject_pt)
 assert.match(copy.body_pt,/https:\/\/wa\.me\/12025550123/)
})
