import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCampaign, campaignConfiguration, renderCampaignEmail, dispatchCampaigns, type CampaignDb, type CampaignProvider } from '../src/lib/email-campaigns'
const input={name:'Seguro',subject_pt:'Olá {{nome}}',body_pt:'Sua proteção importa.',subject_es:'Hola {{nome}}',body_es:'Tu protección importa.',filters:{}}
const config={RESEND_API_KEY:'synthetic-only',RESEND_FROM_EMAIL:'Lead4Pro <seguro@example.invalid>',MANUAL_EMAIL_POSTAL_ADDRESS:'Synthetic postal address',EMAIL_CAMPAIGN_WEBHOOK_SECRET:'synthetic-webhook',EMAIL_CAMPAIGNS_ENABLED:'true'}

test('validation accepts drafts but rejects HTML, unknown keys, malformed filters and blank bilingual copy',()=>{
  assert.equal(validateCampaign(input).ok,true)
  for(const patch of [{body_pt:'<script>alert(1)</script>'},{filters:{buyer_id:'bad'}},{owner:'foreign'},{subject_es:''},{body_es:'Olá {{token}}'},{filters:{states:['FL,OR']}}]) assert.equal(validateCampaign({...input,...patch}).ok,false)
})

test('configuration fails closed: no test sender, no enabled flag, no webhook secret',()=>{
  assert.equal(campaignConfiguration(config).ready,true)
  for(const patch of [{RESEND_FROM_EMAIL:'onboarding@resend.dev'},{EMAIL_CAMPAIGNS_ENABLED:'false'},{EMAIL_CAMPAIGN_WEBHOOK_SECRET:''},{MANUAL_EMAIL_POSTAL_ADDRESS:''}]) assert.equal(campaignConfiguration({...config,...patch}).ready,false)
})

test('campaign sender overrides the shared notification sender without changing shared config',()=>{
  const env={...config,EMAIL_CAMPAIGNS_FROM_EMAIL:'  contato@myhomefirst.us  '}
  const original={...env}
  const c=campaignConfiguration(env)
  assert.equal(c.email,'contato@myhomefirst.us')
  assert.equal(c.from,'Lead4Pro <contato@myhomefirst.us>')
  assert.equal(c.domain,'myhomefirst.us')
  assert.equal(c.ready,true)
  assert.deepEqual(env,original)
  assert.equal(env.RESEND_FROM_EMAIL,config.RESEND_FROM_EMAIL)
})

test('campaign sender keeps the shared sender only when the dedicated value is unset or empty',()=>{
  for(const value of [undefined,'']){
    const c=campaignConfiguration({...config,EMAIL_CAMPAIGNS_FROM_EMAIL:value})
    assert.equal(c.email,'seguro@example.invalid')
    assert.equal(c.from,'Lead4Pro <seguro@example.invalid>')
    assert.equal(c.ready,true)
  }
  const c=campaignConfiguration({...config,EMAIL_CAMPAIGNS_FROM_EMAIL:'My Home First <CONTATO@MYHOMEFIRST.US>'})
  assert.equal(c.email,'contato@myhomefirst.us')
  assert.equal(c.from,'Lead4Pro <contato@myhomefirst.us>')
})

test('an invalid dedicated sender is blocked instead of falling back to the shared sender',()=>{
  for(const value of ['not-an-email','onboarding@resend.dev','x@sub.resend.dev','   ','contato@myhomefirst.us\r\nBcc: other@example.invalid']){
    const c=campaignConfiguration({...config,EMAIL_CAMPAIGNS_FROM_EMAIL:value})
    assert.equal(c.ready,false,value)
    assert.ok(c.issues.includes('Configure um endereço próprio, não o remetente de teste.'),value)
    assert.notEqual(c.email,'seguro@example.invalid')
  }
})

test('worker verifies the dedicated sender domain and uses it in the real dispatch payload',async()=>{
  const c=campaignConfiguration({...config,EMAIL_CAMPAIGNS_FROM_EMAIL:'contato@myhomefirst.us'})
  const row={id:'00000000-0000-0000-0000-000000000020',lease:'fixture-lease',email:'test@example.invalid',name:'Test',language:'pt' as const,unsubscribe_token:'00000000-0000-0000-0000-000000000021',campaign:input}
  let claimed=false,verified='',sender=''
  const db:CampaignDb={rpc:async n=>({data:n==='ec_claim'?(!claimed?(claimed=true,row):null):true,error:null})}
  const provider:CampaignProvider={trackingStatus:async()=>({open:null,click:null,status:"unknown",checked_at:""}),verifyDomain:async domain=>{verified=domain;return true},send:async payload=>{sender=payload.from;return {data:{id:'synthetic-only'},error:null}}}
  const result=await dispatchCampaigns(db,provider,c)
  assert.equal(verified,'myhomefirst.us')
  assert.equal(sender,'Lead4Pro <contato@myhomefirst.us>')
  assert.equal(result.accepted,1)
})

test('a dedicated sender does not enable dispatch or bypass the provider domain check',async()=>{
  let sends=0,claims=0,verifications=0
  const db:CampaignDb={rpc:async()=>{claims++;return {data:null,error:null}}}
  const provider:CampaignProvider={trackingStatus:async()=>({open:null,click:null,status:"unknown",checked_at:""}),verifyDomain:async()=>{verifications++;return false},send:async()=>{sends++;return {data:{id:'synthetic-only'},error:null}}}
  const env={...config,EMAIL_CAMPAIGNS_FROM_EMAIL:'contato@myhomefirst.us'}
  const disabled=await dispatchCampaigns(db,provider,campaignConfiguration({...env,EMAIL_CAMPAIGNS_ENABLED:'false'}))
  assert.equal(disabled.blocked,true)
  assert.equal(verifications,0)
  const unverified=await dispatchCampaigns(db,provider,campaignConfiguration(env))
  assert.equal(unverified.blocked,true)
  assert.equal(verifications,1)
  assert.equal(claims,0)
  assert.equal(sends,0)
})

test('rendering is locale-specific, escapes contact data, includes unsubscribe and postal address',()=>{
  const r=renderCampaignEmail({campaign:input,name:'<img onerror="bad">',language:'es',unsubscribe_token:'00000000-0000-0000-0000-000000000011'},campaignConfiguration(config))
  assert.match(r.subject,/Hola/); assert.match(r.html,/Tu protección/); assert.doesNotMatch(r.html,/<img/)
  assert.match(r.text,/Synthetic postal address/); assert.match(r.text,/Cancelar/)
  assert.match(r.headers['List-Unsubscribe-Post'],/One-Click/)
})

test('worker never calls provider when disabled, authorization fails, or domain is not verified',async()=>{
  let sends=0,claims=0
  const db:CampaignDb={rpc:async()=>{claims++;return {data:null,error:null}}}
  const provider:CampaignProvider={trackingStatus:async()=>({open:null,click:null,status:"unknown",checked_at:""}),verifyDomain:async()=>false,send:async()=>{sends++;return {data:{id:'synthetic'},error:null}}}
  await dispatchCampaigns(db,provider,campaignConfiguration({...config,EMAIL_CAMPAIGNS_ENABLED:'false'}))
  await dispatchCampaigns(db,provider,campaignConfiguration(config))
  assert.equal(sends,0);assert.equal(claims,0)
})

test('worker preserves unknown results and uses stable recipient idempotency, acceptance is not delivery',async()=>{
  const calls:[string,Record<string,unknown>][]=[];let claimed=false
  let payload:Parameters<CampaignProvider['send']>[0]|undefined,options:Parameters<CampaignProvider['send']>[1]|undefined
  const row={id:'00000000-0000-0000-0000-000000000020',lease:'fixture-lease',email:'test@example.invalid',name:'Test',language:'pt' as const,unsubscribe_token:'00000000-0000-0000-0000-000000000021',campaign:input}
  const db:CampaignDb={rpc:async(n,a)=>{calls.push([n,a]);return {data:n==='ec_claim'?(!claimed?(claimed=true,row):null):true,error:null}}}
  const provider:CampaignProvider={trackingStatus:async()=>({open:null,click:null,status:"unknown",checked_at:""}),verifyDomain:async()=>true,send:async(p,o)=>{payload=p;options=o;throw new Error('timeout might have sent')}}
  await dispatchCampaigns(db,provider,campaignConfiguration(config))
  assert.ok(payload&&options)
  assert.deepEqual(payload.to,['test@example.invalid']);assert.equal('bcc' in payload,false);assert.equal(options.idempotencyKey,'l4p-campaign-'+row.id)
  assert.equal(calls.find(c=>c[0]==='ec_finish')?.[1].p_state,'unknown')
  assert.ok(calls.find(c=>c[0]==='ec_authorize'))
})
