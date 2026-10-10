// Core is dependency-injected: tests cannot send real mail or touch production.
export type CampaignFilters = { buyer_id?: string; states?: string[]; languages?: ('pt'|'es')[]; types?: ('hot'|'cold')[]; since?: string; until?: string }
export type CampaignDraft = { name: string; subject_pt: string; body_pt: string; subject_es: string; body_es: string; filters: CampaignFilters }
export const CAMPAIGN_URL = 'https://lead4producers.com'
export const CAMPAIGN_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const emailPattern = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i
const states = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '))
export function validateFilters(input: unknown): {ok:true;value:CampaignFilters}|{ok:false;error:string} {
  if(!input || typeof input!=='object' || Array.isArray(input)) return {ok:false,error:'Público inválido.'}
  const f=input as Record<string,unknown>
  if(Object.keys(f).some(k=>!['buyer_id','states','languages','types','since','until'].includes(k))) return {ok:false,error:'Filtro desconhecido.'}
  if(f.buyer_id!==undefined && (typeof f.buyer_id!=='string'||!CAMPAIGN_UUID.test(f.buyer_id))) return {ok:false,error:'Cliente inválido.'}
  for(const key of ['states','languages','types'] as const){
    const allowed=key==='states'?states:new Set(key==='languages'?['pt','es']:['hot','cold'])
    if(f[key]!==undefined && (!Array.isArray(f[key]) || f[key].length>allowed.size || f[key].some(v=>typeof v!=='string'||!allowed.has(v)))) return {ok:false,error:'Filtro inválido: '+key}
  }
  for(const key of ['since','until']) if(f[key]!==undefined && (typeof f[key]!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(f[key])||!Number.isFinite(Date.parse(f[key])))) return {ok:false,error:'Data inválida.'}
  if(f.since && f.until && Date.parse(String(f.since))>=Date.parse(String(f.until))) return {ok:false,error:'O fim deve ser posterior ao início.'}
  return {ok:true,value:f as CampaignFilters}
}
export function validateCampaign(input: unknown): {ok:true;value:CampaignDraft}|{ok:false;error:string} {
  if(!input||typeof input!=='object'||Array.isArray(input)) return {ok:false,error:'Campanha inválida.'}
  const c=input as Record<string,unknown>,keys=['name','subject_pt','body_pt','subject_es','body_es','filters']
  if(Object.keys(c).some(k=>!keys.includes(k))) return {ok:false,error:'Campo de campanha desconhecido.'}
  for(const key of keys.filter(k=>k!=='filters')){
    const v=c[key],max=key==='name'?100:key.startsWith('subject')?160:20000
    if(typeof v!=='string'||!v.trim()||v.length>max||/<[^>]*>/.test(v)||(/subject|name/.test(key)&&/[\r\n]/.test(v))) return {ok:false,error:'Revise o campo '+key+'. Use texto, sem HTML.'}
    if([...v.matchAll(/{{([^}]+)}}/g)].some(m=>m[1].trim()!=='nome')||v.replace(/{{\s*nome\s*}}/g,'').includes('{{')) return {ok:false,error:'A variável permitida é {{nome}}.'}
  }
  const f=validateFilters(c.filters??{})
  if(!f.ok)return f
  return {ok:true,value:{name:String(c.name).trim(),subject_pt:String(c.subject_pt).trim(),subject_es:String(c.subject_es).trim(),body_pt:String(c.body_pt).trim(),body_es:String(c.body_es).trim(),filters:f.value}}
}
export type CampaignConfiguration={ready:boolean;issues:string[];key:string;webhookSecret:string;from:string;email:string;domain:string;postal:string;dailyLimit:number}
export function campaignConfiguration(env:Record<string,string|undefined>):CampaignConfiguration {
  const issues:string[]=[],key=(env.RESEND_API_KEY||'').trim(),webhookSecret=(env.EMAIL_CAMPAIGN_WEBHOOK_SECRET||'').trim()
  const raw=(env.RESEND_FROM_EMAIL||'').trim(),email=(raw.match(/<([^<>]+)>$/)?.[1]||raw).toLowerCase(),domain=email.split('@')[1]||''
  const postal=(env.MANUAL_EMAIL_POSTAL_ADDRESS||'').trim(),daily=env.EMAIL_CAMPAIGN_DAILY_LIMIT||'200',dailyLimit=Number(daily)
  if(env.EMAIL_CAMPAIGNS_ENABLED!=='true')issues.push('Disparos de campanha desativados.')
  if(!key)issues.push('Falta configurar a chave do provedor.')
  if(!webhookSecret)issues.push('Falta configurar os retornos de campanha do provedor.')
  if(!emailPattern.test(email)||email.length>254||/[\r\n]/.test(raw)||domain==='resend.dev'||domain.endsWith('.resend.dev'))issues.push('Configure um endereço próprio, não o remetente de teste.')
  if(postal.length<10||postal.length>500)issues.push('Falta um endereço postal válido no rodapé.')
  if(!/^\d+$/.test(daily)||!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>10000)issues.push('O limite diário deve ser de 1 a 10.000.')
  return {ready:issues.length===0,issues,key,webhookSecret,from:`Lead4Pro <${email}>`,email,domain,postal,dailyLimit}
}
function escapeHtml(s:string){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}
export function renderCampaignEmail(row:{campaign:CampaignDraft;name:string;language:'pt'|'es';unsubscribe_token:string},config:CampaignConfiguration){
  if(!CAMPAIGN_UUID.test(row.unsubscribe_token)||!['pt','es'].includes(row.language))throw new Error('invalid_recipient')
  const subject=row.campaign[row.language==='es'?'subject_es':'subject_pt'].replace(/{{\s*nome\s*}}/g,row.name.replace(/[\r\n]/g,' ').slice(0,120))
  const body=row.campaign[row.language==='es'?'body_es':'body_pt'].replace(/{{\s*nome\s*}}/g,row.name.slice(0,200))
  const unsubscribe=`${CAMPAIGN_URL}/api/email-campaigns/unsubscribe/${row.unsubscribe_token}`
  const label=row.language==='es'?'Cancelar suscripción':'Cancelar recebimento'
  // Plain-text authoring; safe HTML counterpart for clickable links. No arbitrary HTML/editor scripts.
  const html=escapeHtml(body).replace(/https?:\/\/[^\s<>]+/g,url=>`<a href="${url}">${url}</a>`).replace(/\n/g,'<br/>')
  return {subject,text:`${body}\n\nLead4Pro · ${config.postal}\n${label}: ${unsubscribe}`,
    html:`<div style="font:16px/1.6 Arial,sans-serif;color:#0f172a">${html}<hr/><p style="font-size:12px">Lead4Pro · ${escapeHtml(config.postal)}<br/><a href="${unsubscribe}">${label}</a></p></div>`,
    headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}
}
export type CampaignRecipient={id:string;lease:string;email:string;name:string;language:'pt'|'es';unsubscribe_token:string;campaign:CampaignDraft}
export type CampaignDb={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>}
export async function campaignRpc<T=unknown>(db:CampaignDb,name:string,args:Record<string,unknown>={}) {
  const {data,error}=await db.rpc(name,args)
  if(error)throw new Error('campaign_database_error')
  return data as T
}
export type CampaignProvider={verifyDomain:(domain:string)=>Promise<boolean>;send:(payload:{from:string;to:string[];subject:string;text:string;html:string;headers:Record<string,string>;tags:{name:string;value:string}[]},options:{idempotencyKey:string})=>Promise<{data:{id:string}|null;error:{name?:string}|null}>}
const provenRejections=new Set(['validation_error','missing_required_field','invalid_from_address','invalid_parameter','restricted_api_key','invalid_api_key','not_found','rate_limit_exceeded','daily_quota_exceeded'])
export async function dispatchCampaigns(db:CampaignDb,provider:CampaignProvider,config:CampaignConfiguration){
  const deadline=Date.now()+45000
  const result={accepted:0,refused:0,unknown:0,skipped:0,blocked:!config.ready}
  if(!config.ready)return result
  if(!await provider.verifyDomain(config.domain))return {...result,blocked:true}
  for(let i=0;i<10 && Date.now()<deadline-12000;i++){
    const row=await campaignRpc<CampaignRecipient|null>(db,'ec_claim',{p_daily:config.dailyLimit})
    if(!row)break
    // Render before authorizing. No external effect until the last SQL permission check.
    let copy:ReturnType<typeof renderCampaignEmail>
    try{copy=renderCampaignEmail(row,config)}catch{
      // A malformed persisted draft must not send. Its reservation expires safely.
      result.skipped++;continue
    }
    if(!await campaignRpc(db,'ec_authorize',{p_id:row.id,p_lease:row.lease})){result.skipped++;continue}
    let state:'accepted'|'refused'|'unknown'='unknown',providerId:string|null=null
    try{
      const r=await provider.send({from:config.from,to:[row.email],...copy,tags:[{name:'module',value:'admin_insurance_campaigns'},{name:'recipient',value:row.id}]},{idempotencyKey:'l4p-campaign-'+row.id})
      if(r.data?.id&&!r.error){state='accepted';providerId=r.data.id}
      else if(r.error?.name&&provenRejections.has(r.error.name))state='refused'
    }catch{ /* no proof of rejection: quarantine, never resend automatically */ }
    await campaignRpc(db,'ec_finish',{p_id:row.id,p_lease:row.lease,p_state:state,p_provider:providerId,p_reason:state==='accepted'?null:state==='unknown'?'provider_result_uncertain':'provider_rejected'})
    result[state]++
    if(state!=='accepted')break // protect reputation and quota when the provider fails
  }
  return result
}
