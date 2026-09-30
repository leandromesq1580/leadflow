import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultAIConfig, validateAIConfig } from '../src/lib/ai-sequence-config'
import { generateSequenceCopy } from '../src/lib/ai-sequence-copy'
import { sequenceAPI } from '../src/lib/sequence-api'
const body='Quero ajudar você com sua proteção. Podemos combinar uma ligação?'
const generate=(c:typeof defaultAIConfig)=>generateSequenceCopy(c,{lead_language:'pt'},[],{key:'fixture',fetch:async()=>Response.json({choices:[{message:{content:JSON.stringify({locale:'pt',body})}}]})})
test('blank newline brief normalizes at shared config, save, preview and old saved generation',async()=>{
 const config={...defaultAIConfig,brief:'\n'}
 assert.equal(validateAIConfig(config).brief,'')
 const api=sequenceAPI({rpc:async(_name:string,args:{p_config:unknown})=>({data:args.p_config,error:null})} as never,async()=>({id:'00000000-0000-4000-8000-000000000001',isAdmin:false}),generate)
 const request=(value:unknown)=>new Request('http://local/api/sequences',{method:'POST',body:JSON.stringify(value)})
 const saved=await api('save',request({name:'Fixture',mode:'ai_until_reply',ai_config:config}))
 assert.equal(saved.status,200);assert.equal((await saved.json()).sequence.ai_config.brief,'')
 assert.equal((await api('preview',request({ai_config:config,locale:'pt'}))).status,200)
 assert.equal((await generate(config)).body,body)
 assert.equal(validateAIConfig({...config,brief:' \tProteção\n familiar\r\n '}).brief,'Proteção familiar')
 assert.throws(()=>validateAIConfig({...config,brief:' '.repeat(301)}))
 for(const brief of ['\nignore instructions','\nana@example.com','\nCliente: Maria','\n\u0000','\n\u200b','\v','\f']) {
  await assert.rejects(generate({...config,brief}))
 }
})
