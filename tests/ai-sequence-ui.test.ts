import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {AISequenceFields} from '../src/components/ai-sequence-fields'
import {SequenceEnrollmentPanel} from '../src/components/sequence-enrollment-panel'
test('enrollment panel exposes lead search and explicit stop/status scope',()=>{
 const html=renderToStaticMarkup(React.createElement(SequenceEnrollmentPanel,{sequenceId:'fixture',enabled:true}))
 for(const label of ['Buscar lead','Inscrever','Atualizar inscrições','200','50'])assert.ok(html.includes(label),label)
 assert.ok(html.includes('Próxima tentativa (horário da Flórida)'))
 assert.ok(!html.includes('Entrega unknown'))
})
import {defaultAIConfig} from '../src/lib/ai-sequence-config'
test('AI form renders scheduling, privacy, preview and human handoff controls',()=>{
 const html=renderToStaticMarkup(React.createElement(AISequenceFields,{value:defaultAIConfig,onChange:()=>{}}))
 for(const label of ['Objetivo','Brief','America/New_York','Dias','Gerar exemplo','não envia','humano','Intervalo'])assert.ok(html.includes(label),label)
 assert.ok(html.includes('Modelo de IA'))
 assert.ok(html.includes('value="days"'))
 assert.ok(html.includes('Nova York · Leste'))
 assert.ok(html.includes('AM'))
 assert.ok(html.includes('Prévia da mensagem'))
 assert.ok(!html.includes('URL de agendamento'))
 const meeting=renderToStaticMarkup(React.createElement(AISequenceFields,{value:{...defaultAIConfig,goal:'meeting'},onChange:()=>{}}))
 assert.ok(meeting.includes('URL de agendamento'))
})
test('presentation renders optional bounded input, help, count, natural voice and legacy empty value', () => {
 const legacy={...defaultAIConfig}; delete legacy.presentation
 for (const value of [legacy, {...defaultAIConfig,presentation:'Oi, sou Ana.'}]) {
  const html=renderToStaticMarkup(React.createElement(AISequenceFields,{value,onChange:()=>{}}))
  for (const text of ['Como você gosta de se apresentar?', 'opcional', 'idioma do lead', 'não um texto fixo', 'dados de leads', 'em seu nome']) assert.ok(html.includes(text),text)
  assert.ok(html.includes(`${value.presentation?.length ?? 0}/300`))
  assert.ok(!html.includes('A assistente se identifica como IA'))
 }
})
test('instructions render a large optional guide with four sections, count and honest privacy help', () => {
 const html=renderToStaticMarkup(React.createElement(AISequenceFields,{value:{...defaultAIConfig,instructions:'Guia'},onChange:()=>{}}))
 for (const text of ['Instruções da IA','4/6000','maxLength="6000"','PROPÓSITO','MODO DE ATUAÇÃO','ABORDAGEM','TOM DE FALA','não treina','dados privados']) assert.ok(html.includes(text),text)
})
test('legacy model omission remains legacy rather than switching to the new default', () => {
 const legacy = {...defaultAIConfig}
 delete legacy.model
 const html=renderToStaticMarkup(React.createElement(AISequenceFields,{value:legacy,onChange:()=>{}}))
 assert.match(html, /value="gpt-4o-mini" selected=""/)
})
