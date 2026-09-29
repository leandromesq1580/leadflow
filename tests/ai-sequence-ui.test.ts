import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {AISequenceFields} from '../src/components/ai-sequence-fields'
import {SequenceEnrollmentPanel} from '../src/components/sequence-enrollment-panel'
test('enrollment panel exposes lead search and explicit stop/status scope',()=>{
 const html=renderToStaticMarkup(React.createElement(SequenceEnrollmentPanel,{sequenceId:'fixture',enabled:true}))
 for(const label of ['Buscar lead','Inscrever','Atualizar inscrições','200','50'])assert.ok(html.includes(label),label)
 assert.ok(html.includes('Próximo envio (horário da Flórida)'))
 assert.ok(!html.includes('Entrega unknown'))
})
import {defaultAIConfig} from '../src/lib/ai-sequence-config'
test('AI form renders scheduling, privacy, preview and human handoff controls',()=>{
 const html=renderToStaticMarkup(React.createElement(AISequenceFields,{value:defaultAIConfig,onChange:()=>{}}))
 for(const label of ['Objetivo','Brief','America/New_York','Dias','Gerar exemplo','não envia','humano','Intervalo','agendamento'])assert.ok(html.includes(label),label)
})
