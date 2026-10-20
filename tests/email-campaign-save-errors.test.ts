import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCampaign } from '../src/lib/email-campaigns'

// 20/10/2026: "Salvar rascunho" parecia não fazer nada — a recusa por campo vazio (aba Español) aparecia
// só numa faixa no topo da página, com o nome interno do campo ("subject_es").
const ok = {
  name: 'Re: Sua cotação seguro',
  subject_pt: 'Re: Sua cotação de seguro de vida USA chegou!',
  body_pt: 'Oi {{nome}}, tudo bem? Quer conversar sobre seguro de vida?',
  subject_es: '¡Llegó tu cotización de seguro de vida en USA!',
  body_es: 'Hola {{nome}}, ¿cómo estás? ¿Quieres conversar sobre el seguro de vida?',
  filters: {},
}

test('campanha completa nos dois idiomas é aceita', () => {
  assert.equal(validateCampaign(ok).ok, true)
})

test('aba Español vazia: a mensagem diz qual campo falta, em português e sem nome interno', () => {
  for (const [key, label] of [
    ['subject_es', 'Assunto em espanhol'],
    ['body_es', 'Mensagem em espanhol'],
    ['subject_pt', 'Assunto em português'],
    ['body_pt', 'Mensagem em português'],
    ['name', 'Nome da campanha'],
  ] as const) {
    const r = validateCampaign({ ...ok, [key]: '   ' })
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.match(r.error, new RegExp(`Falta preencher: ${label}`))
      assert.doesNotMatch(r.error, /subject_|body_/)
    }
  }
})

test('aba Español com o mesmo texto do português é recusada (idioma errado)', () => {
  for (const patch of [{ body_es: ok.body_pt }, { subject_es: ok.subject_pt }]) {
    const r = validateCampaign({ ...ok, ...patch })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /Español.*(igual|mesmo)|(igual|mesmo).*Español/i)
  }
})

test('HTML solto continua recusado, agora com o nome do campo em português', () => {
  const r = validateCampaign({ ...ok, subject_es: '<b>Hola</b>' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.error, /Assunto em espanhol/)
})
