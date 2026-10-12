import test from 'node:test'
import assert from 'node:assert/strict'
import {CampaignAIError,generateCampaignCopy} from '../src/lib/email-campaign-ai'
const input={insurance:'Seguro',theme:'Entender opções sem texto de cartilha.',phone:'+12025550123'}
const safe={name:'Conversa sobre seguro',subject_pt:'Seguro fica pra depois?',body_pt:'Seguro pode parecer um assunto comprido, cheio de termos difíceis. Dá pra começar por uma conversa sobre quais opções existem e o que cada uma resolve, sem escolher nada agora. Se fizer sentido, me chama no WhatsApp e a gente começa pela sua dúvida.',subject_es:'¿El seguro se queda para después?',body_es:'El seguro puede parecer un tema largo, lleno de términos difíciles. Podemos empezar por una conversación sobre las opciones y lo que resuelve cada una, sin elegir nada ahora. Si te parece, mándame un mensaje por WhatsApp y empezamos por tu duda.'}
const response=(copy:typeof safe)=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(copy)}}]})
test('reescreve frases de cartilha que o validador técnico antigo aceitava',async()=>{
 let calls=0;const payloads:{messages:{role:string;content:string}[]}[]=[]
 const bad={...safe,body_pt:'É comum deixar o seguro pra depois, né? Mas a verdade é que uma conversa pode ajudar a entender as opções sem escolher nada agora. Se quiser tirar a dúvida, me chama no WhatsApp. MARCADOR_DA_RESPOSTA_RECUSADA',body_es:'Mucha gente deja el seguro para después. Pero la verdad es que una conversación puede ayudar a entender las opciones. Escríbenos por WhatsApp.'}
 const copy=await generateCampaignCopy(input,{key:'synthetic',fetch:async(_url,opts)=>{payloads.push(JSON.parse(String(opts?.body)));return response(++calls===1?bad:safe)}})
 assert.equal(calls,2);assert.equal(copy.subject_pt,safe.subject_pt)
 assert.match(payloads[1].messages.at(-1)!.content,/editorial/i)
 assert.equal(payloads[1].messages.at(-1)!.role,'system')
 assert.match(payloads[1].messages.at(-1)!.content,/cena concreta/i)
 assert.equal(JSON.stringify(payloads[1]).includes('MARCADOR_DA_RESPOSTA_RECUSADA'),false)
 assert.equal(JSON.stringify(payloads[1]).includes(input.phone.replace('+','')),false)
})
test('clichê em apenas um idioma ou assunto também exige reescrita',async()=>{
 for(const [field,phrase] of [['body_pt','A VERDADE É QUE'],['body_es','Mucha gente'],['subject_pt','Descubra as vantagens'],['subject_es','Descubre las ventajas'],['body_pt','Muita\n gente'],['body_es','Una herramienta importante']] as const){
  let calls=0
  const copy=await generateCampaignCopy(input,{key:'synthetic',fetch:async()=>response(++calls===1?{...safe,[field]:phrase+' '+safe[field]}:safe)})
  assert.equal(calls,2,field+' / '+phrase);assert.equal(copy.subject_es,safe.subject_es)
 }
})
test('duas respostas ruins editorialmente não são entregues e não geram terceira chamada',async()=>{
 let calls=0
 await assert.rejects(()=>generateCampaignCopy(input,{key:'synthetic',fetch:async()=>{calls++;return response({...safe,body_pt:'Muita gente '+safe.body_pt})}}),e=>e instanceof CampaignAIError&&e.code==='invalid_copy')
 assert.equal(calls,2)
})
test('voz informal sem clichê é entregue na primeira chamada',async()=>{
 let calls=0
 const copy=await generateCampaignCopy(input,{key:'synthetic',fetch:async()=>{calls++;return response(safe)}})
 assert.equal(calls,1);assert.equal(copy.body_pt.split('\n\nhttps://')[0],safe.body_pt)
})
test('tamanho, parágrafos e CTA nos dois idiomas são conferidos antes da entrega',async()=>{
 const invalid=[{...safe,subject_pt:'s'.repeat(81)},{...safe,body_pt:'Conversa curta pelo WhatsApp.'},{...safe,body_es:Array(91).fill('opciones').join(' ')+' WhatsApp'},{...safe,body_pt:safe.body_pt+'\n\nprimeiro\n\nsegundo\n\nterceiro'},{...safe,body_es:safe.body_es.replace('WhatsApp','outro canal')}]
 for(const bad of invalid){let calls=0;const copy=await generateCampaignCopy(input,{key:'synthetic',fetch:async()=>response(++calls===1?bad:safe)});assert.equal(calls,2);assert.equal(copy.subject_pt,safe.subject_pt)}
})
test('alternativas de promessa vistas no teste real também são recusadas',async()=>{
 for(const phrase of ['Pode garantir tranquilidade.','Vai seguir sem aperto.','Todo siga tranquilo.','Você sabia?']){let calls=0;await generateCampaignCopy(input,{key:'synthetic',fetch:async()=>response(++calls===1?{...safe,body_pt:phrase+' '+safe.body_pt}:safe)});assert.equal(calls,2,phrase)}
})
