import test from 'node:test'
import assert from 'node:assert/strict'
import * as client from '../src/lib/sequence-client'
import { defaultAIConfig } from '../src/lib/ai-sequence-config'

test('duplicate is a detached disabled draft with allowlisted steps and localized bounded name', () => {
  assert.equal(typeof client.duplicateSequenceDraft, 'function')
  const original = { id:'original', name:'A'.repeat(120), description:'Description', enabled:true, mode:'ai_until_reply' as const, ai_config: structuredClone(defaultAIConfig), trigger_stage_id:'stage', sequence_steps:[{id:'step', sequence_id:'original', delay_hours:12, step_type:'send_template' as const, template_id:'tpl', custom_body:'Hello'}], enrollments:['lead'], history:['message'], lease:'lease' }
  const before = structuredClone(original)
  for (const [locale,suffix] of [['pt',' (cópia)'],['en',' (copy)'],['es',' (copia)']]) {
    const draft = client.duplicateSequenceDraft(original, locale)
    assert.equal(draft.enabled,false)
    assert.equal(draft.name.length,120)
    assert.ok(draft.name.endsWith(suffix))
    assert.deepEqual(Object.keys(draft).sort(), ['name','description','enabled','mode','ai_config','trigger_stage_id','reply_stage_id','sequence_steps'].sort())
    assert.deepEqual(draft.sequence_steps,[{delay_hours:12,step_type:'send_template',template_id:'tpl',custom_body:'Hello'}])
    assert.deepEqual(draft.ai_config,original.ai_config)
    draft.ai_config!.days.push(0)
    draft.sequence_steps[0].custom_body='Changed'
  }
  assert.deepEqual(original,before)
  const oldConfig = {...original.ai_config}; delete oldConfig.model
  const legacyModel = client.duplicateSequenceDraft({...original,ai_config:oldConfig},'pt')
  assert.equal(legacyModel.ai_config?.model,undefined)
  const legacy = client.duplicateSequenceDraft({...original,mode:'legacy'},'pt')
  assert.equal(legacy.mode,'legacy'); assert.equal(legacy.enabled,false)
})
