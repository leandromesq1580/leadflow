import test from 'node:test'
import assert from 'node:assert/strict'
import { sequenceJSON,saveSequenceDraft } from '../src/lib/sequence-client'
test('UI load throws explicit HTTP errors and save failure preserves draft',async()=>{
 await assert.rejects(sequenceJSON('/api/sequences',undefined,async()=>Response.json({error:'Sem sessão'},{status:401})),/Sem sessão/)
 let closed=false,reloaded=false
 await assert.rejects(saveSequenceDraft('/api/sequences',{},()=>{closed=true},async()=>{reloaded=true},async()=>Response.json({error:'Falha ao salvar'},{status:503})),/Falha ao salvar/)
 assert.equal(closed,false);assert.equal(reloaded,false)
})
test('saved draft closes once; reload failure is explicitly not save failure',async()=>{
 let closed=0
 await assert.rejects(saveSequenceDraft('/api/sequences',{},()=>{closed++},async()=>{throw Error('offline')},async()=>Response.json({sequence:{id:'fixture'}})),/Salvo.*recarregar/)
 assert.equal(closed,1)
})
