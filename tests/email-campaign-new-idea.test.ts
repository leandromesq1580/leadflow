import test from 'node:test'
import assert from 'node:assert/strict'
import {generateCampaignCopy} from '../src/lib/email-campaign-ai'

const input={insurance:'Seguro de vida',theme:'Entender proteção e valor de resgate conforme a apólice',phone:'1 786 744 2126'}
const old={name:'Proteção e escolhas',subject_pt:'Se você faltar, como ficam as contas?',body_pt:'O aluguel vence e as contas continuam chegando. Se faltar quem ajuda a pagar, sua família pode precisar de apoio. O seguro de vida pode oferecer um benefício aos beneficiários, conforme as condições da apólice. Me chama no WhatsApp pra entender quais opções fazem sentido e pedir uma cotação.',subject_es:'Si tú faltas, ¿qué pasa con las cuentas?',body_es:'El alquiler vence y las cuentas siguen llegando. Si falta quien ayuda a pagarlas, tu familia puede necesitar apoyo. El seguro de vida puede ofrecer un beneficio a los beneficiarios, según las condiciones de la póliza. Escríbeme por WhatsApp para conocer las opciones y solicitar una cotización.'}
const fresh={name:'Planejar com clareza',subject_pt:'Um plano que começa pela sua dúvida',body_pt:'Escolher uma apólice também é pensar no que você quer organizar pro futuro. Em algumas modalidades de seguro de vida, o valor de resgate tem condições, prazos e limites que vale entender antes de decidir. Me chama no WhatsApp pra conversar sobre essas regras e pedir uma cotação.',subject_es:'Un plan que empieza por tu duda',body_es:'Elegir una póliza también es pensar en lo que quieres organizar para el futuro. En algunas modalidades de seguro de vida, el valor de rescate tiene condiciones, plazos y límites que conviene conocer antes de decidir. Escríbeme por WhatsApp para conversar sobre esas reglas y solicitar una cotización.'}
const response=(copy:unknown)=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(copy)}}]})

test('Gerar outra versão rejeita repetição literal e pede uma ideia diferente no mesmo prazo',async()=>{
 let calls=0
 const copy=await generateCampaignCopy({...input,variation:1,previous:[old]},{key:'synthetic-only',fetch:async()=>response(++calls===1?old:fresh)})
 assert.equal(calls,2,'Não aceitar silenciosamente a mesma ideia anterior')
 assert.equal(copy.subject_pt,fresh.subject_pt)
 assert.equal(copy.subject_es,fresh.subject_es)
})

test('repetição nos dois retornos falha sem entregar a sugestão velha',async()=>{
 let calls=0
 await assert.rejects(()=>generateCampaignCopy({...input,variation:1,previous:[old]},{key:'synthetic-only',fetch:async()=>{calls++;return response(old)}}),e=>e instanceof Error&&'code' in e&&e.code==='invalid_copy')
 assert.equal(calls,2,'Mesma reescrita limitada; não criar laço de chamadas')
})

test('trocar só o assunto ou só um idioma não transforma a mesma mensagem em ideia nova',async()=>{
 for(const candidate of [{...old,subject_pt:'Uma nova pergunta sobre proteção'},{...fresh,body_es:old.body_es}]){
  await assert.rejects(()=>generateCampaignCopy({...input,variation:2,previous:[old]},{key:'synthetic-only',fetch:async()=>response(candidate)}))
 }
})

test('cada clique orienta outro ângulo e mantém produto/tema e histórico como dados',async()=>{
 const payloads:Record<string,unknown>[]=[]
 for(const variation of [0,1])await generateCampaignCopy({...input,variation},{key:'synthetic-only',fetch:async(_url,options)=>{payloads.push(JSON.parse(String(options?.body)));return response(fresh)}})
 const briefs=payloads.map(p=>JSON.parse((p.messages as {content:string}[])[1].content))
 assert.notEqual(briefs[0].creativeAngle,briefs[1].creativeAngle)
 assert.equal(briefs[1].insurance,input.insurance)
 assert.equal(briefs[1].theme,input.theme)
 assert.equal(JSON.stringify(payloads).includes(input.phone),false)
 assert.match((payloads[1].messages as {content:string}[])[0].content,/nova ideia/i)
})

test('histórico inválido, excessivo ou com dados de contato é recusado antes de consultar IA',async()=>{
 for(const extra of [{variation:-1},{variation:1.5},{variation:Infinity},{previous:[{...old,body_pt:'Fale com pessoa@example.invalid'}]},{previous:[{...old,body_es:'<script>alert()</script>'}]},{previous:[old,old,old,old]}]){
  let calls=0
  await assert.rejects(()=>generateCampaignCopy({...input,...extra},{key:'synthetic-only',fetch:async()=>{calls++;return response(fresh)}}))
  assert.equal(calls,0)
 }
})

test('não volta à ideia A depois de gerar B; consulta histórico sem enviar nomes ou contatos',async()=>{
 const payloads:Record<string,unknown>[]=[]
 await assert.rejects(()=>generateCampaignCopy({...input,variation:2,previous:[old,fresh]},{key:'synthetic-only',fetch:async(_url,options)=>{
  payloads.push(JSON.parse(String(options?.body)));return response(old)
 }}))
 assert.equal(payloads.length,2)
 for(const payload of payloads){
  const history=JSON.parse((payload.messages as {content:string}[])[1].content).previous
  assert.equal(history.length,2);assert.equal('name' in history[0],false)
  assert.equal(JSON.stringify(payload).includes(input.phone),false)
 }
})

test('paráfrase cosmética não passa como nova ideia',async()=>{
 const paraphrase={...old,subject_pt:'Outra conversa sobre proteção',body_pt:old.body_pt.replace('O aluguel vence e as contas continuam chegando.','As contas continuam chegando e o aluguel vence.').replace('apoio','suporte')}
 await assert.rejects(()=>generateCampaignCopy({...input,variation:2,previous:[old]},{key:'synthetic-only',fetch:async()=>response(paraphrase)}))
})

test('com seguro de vida escolhido, a mensagem precisa falar do produto nos dois idiomas',async()=>{
 const unrelated={...fresh,body_pt:'Escolher um plano também é pensar no que você quer organizar pro futuro. Existem condições, prazos e limites que vale entender antes de decidir. As perguntas certas podem ajudar a avaliar as opções com clareza, de acordo com as suas necessidades. Me chama no WhatsApp pra conversar e pedir uma cotação.'}
 await assert.rejects(()=>generateCampaignCopy({...input,variation:2},{key:'synthetic-only',fetch:async()=>response(unrelated)}))
})
