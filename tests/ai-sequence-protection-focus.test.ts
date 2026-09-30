import test from 'node:test'
import assert from 'node:assert/strict'
import { generateSequenceCopy } from '../src/lib/ai-sequence-copy'
import { defaultAIConfig } from '../src/lib/ai-sequence-config'

const examples = {
 pt: ['🙂 Você já tem alguma proteção para sua família?', '💛 Você tem alguém que depende do seu apoio?', '🌱 Você já tem uma reserva para imprevistos?', '😊 Sua família tem alguém aqui ou no Brasil para contar em um imprevisto?'],
 es: ['🙂 ¿Ya tienes alguna protección para tu familia?', '💛 ¿Tu familia depende de tu apoyo?', '🌱 ¿Ya tienes ahorros para imprevistos?', '😊 ¿Tu familia tiene apoyo aquí o en Brasil para un imprevisto?'],
 en: ['🙂 Do you have any protection for your family?', '💛 Does your family depend on your support?', '🌱 Do you have any savings for unexpected needs?', '😊 Who could your family turn to for support here or in Brazil?'],
}

for (const locale of ['pt', 'es', 'en'] as const) test(`protection-focused prompt contract and outbound context: ${locale} (not live model quality)`, async () => {
 const recent: string[] = []
 for (const body of examples[locale]) {
  const instructions = 'Tom direto. Priorize apoio familiar. Não peça valores.'
  let payload!: {messages: {content:string}[]}
  const result = await generateSequenceCopy({...defaultAIConfig, instructions}, {lead_language:locale}, [...recent, 'raw private inbox'], {
   key:'fixture', fetch:async (_url, init) => {
    payload = JSON.parse(String(init?.body))
    return Response.json({choices:[{message:{content:JSON.stringify({locale, body})}}]})
   },
  })
    const system = payload.messages[0].content
    const data = JSON.parse(payload.messages[1].content)
    assert.match(system, /each engagement question must.*useful.*human agent/i)
    assert.match(system, /dependents.*responsibilities/i)
    assert.match(system, /here or in Brazil/i)
    assert.match(system, /reserves.*yes\/no.*never balance or amounts/i)
    assert.match(system, /Never use home buying, dreams, hobbies or generic adaptation as standalone topics/i)
    assert.match(system, /United States.*only.*explicit.*family responsibilities or protection.*question itself/i)
    assert.match(system, /privately choose.*information.*responsibility/i)
    assert.match(system, /Gostaria de conhecer.*Tenho curiosidade.*Gosto de entender/i)
    assert.match(system, /outbound attempts only, NOT replies/i)
    assert.match(system, /Do not infer answers/i)
    assert.match(system, /100–160/)
    assert.equal(data.max_body_characters, 180)
    assert.equal(data.locale, locale)
    assert.equal(data.instructions, instructions)
    assert.equal(data.direct_invitation_allowed, false)
    assert.deepEqual(data.previous_drafts, recent.slice(-3).map(value => value.slice(9)))
    assert.deepEqual(Object.keys(data).sort(), ['locale','goal','final_goal_word','direct_invitation_allowed','commercial_brief','instructions','presentation','previous_drafts','max_body_characters'].sort())
  assert.equal(result.body, body)
  recent.push(result.choice)
 }
})
