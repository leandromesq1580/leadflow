import { CAMPAIGN_UUID, CampaignConfiguration, CampaignDb, CampaignProvider, validateCampaign, validateFilters } from './email-campaigns'
import { META_FORM_LANGUAGES } from './lead-language'
type Dependencies={authenticate:()=>Promise<{id:string}|Response>;runtime:()=>{db:CampaignDb;config:CampaignConfiguration;provider:CampaignProvider}}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}})
const error=(message:string,status=400)=>json({error:message},status)
const messages:Record<string,string>={draft_required:'Só rascunhos podem ser editados ou agendados.',campaign_not_found:'Campanha não encontrada.',invalid_transition:'Essa ação não está disponível no estado atual.',empty_audience:'Não há contatos liberados para esta campanha.',admin_required:'Acesso exclusivo do admin.',audience_changed:'O público mudou. Confira a prévia novamente.'}
export function createCampaignHandlers(deps:Dependencies){
 async function run(request:Request,write:boolean){
  const auth=await deps.authenticate();if(auth instanceof Response)return auth
  try{
   const url=new URL(request.url),page=Number(url.searchParams.get('page')||'0'),id=url.searchParams.get('id')
   if(id&&!CAMPAIGN_UUID.test(id)||!Number.isInteger(page)||page<0||page>100000)return error('Página ou campanha inválida.')
   if(write){
    const origin=request.headers.get('origin')
    if((origin&&origin!==url.origin)||!request.headers.get('content-type')?.includes('application/json'))return error('Origem ou formato inválido.',403)
   }
   const {db,config,provider}=deps.runtime()
   const rpc=async<T=unknown>(name:string,args:Record<string,unknown>)=>{
    const {data,error:e}=await db.rpc(name,args)
    if(e){const m=String((e as {message?:string}).message||'');const known=Object.keys(messages).find(k=>m.includes(k));if(known)throw new Error(known);throw new Error('database')}
    return data as T
   }
   if(!write){
    const result=await rpc<Record<string,unknown>>('ec_list',{p_actor:auth.id,p_id:id,p_page:page})
    let verified=false
    try{if(config.ready)verified=await provider.verifyDomain(config.domain)}catch{}
    return json({...result,configuration:{ready:config.ready&&verified,issues:[...config.issues,...(config.ready&&!verified?['Domínio não confirmado pelo provedor; envio bloqueado.']:[])],from:config.email,domainVerified:verified,dailyLimit:config.dailyLimit}})
   }
   const raw=await request.text();if(raw.length>50000)return error('Campanha muito grande.',413)
type ActionBody={action?:string;id?:string;campaign?:unknown;filters?:unknown;evidence?:string;confirm?:boolean;at?:string;expected?:number}
   let body:ActionBody;try{body=JSON.parse(raw)}catch{return error('Pedido inválido.')}
   if(!body||typeof body!=='object'||Array.isArray(body))return error('Pedido inválido.')
   const actor={p_actor:auth.id},forms={p_forms:META_FORM_LANGUAGES}
   if(body.action==='save'){
    if(body.id!==undefined&&!CAMPAIGN_UUID.test(body.id))return error('Campanha inválida.')
    const validated=validateCampaign(body.campaign);if(!validated.ok)return error(validated.error)
    return json({campaign:await rpc('ec_save',{...actor,p_id:body.id||null,p_data:validated.value})})
   }
   if(body.action==='preview'||body.action==='permission'){
    const validated=validateFilters(body.filters);if(!validated.ok)return error(validated.error)
    if(body.action==='permission'){
     if(body.confirm!==true||typeof body.evidence!=='string'||body.evidence.trim().length<10||body.evidence.length>2000)return error('Confirme a permissão e descreva sua origem (10 a 2.000 caracteres).')
     return json({recorded:await rpc('ec_record_permission',{...actor,...forms,p_filters:validated.value,p_evidence:body.evidence,p_confirm:true})})
    }
    return json({audience:await rpc('ec_audience',{...actor,...forms,p_filters:validated.value})})
   }
   if(typeof body.action==='string'&&['schedule','pause','resume','cancel'].includes(body.action)){
    if(typeof body.id!=='string'||!CAMPAIGN_UUID.test(body.id))return error('Campanha inválida.')
    if(body.action==='schedule'){
     if(!config.ready)return json({error:'Configure o provedor antes de agendar.',issues:config.issues},409)
     if(body.confirm!==true||typeof body.expected!=='number'||!Number.isSafeInteger(body.expected)||body.expected<1)return error('Confira o público e confirme o agendamento.')
     if(typeof body.at!=='string'||!Number.isFinite(Date.parse(body.at))||Date.parse(body.at)>Date.now()+366*86400000)return error('Horário inválido.')
     if(!await provider.verifyDomain(config.domain))return error('Domínio não confirmado pelo provedor. Envio bloqueado.',409)
     return json({campaign:await rpc('ec_schedule',{...actor,...forms,p_id:body.id,p_at:body.at,p_expected:body.expected})})
    }
    // Pausing/cancelling must still work if provider configuration breaks.
    return json({campaign:await rpc('ec_control',{...actor,p_id:body.id,p_action:body.action})})
   }
   return error('Ação inválida.')
  }catch(e){const key=e instanceof Error?e.message:'';return error(messages[key]||'Não foi possível concluir. Nenhum reenvio automático será feito.',messages[key]?409:503)}
 }
 return {GET:(r:Request)=>run(r,false),POST:(r:Request)=>run(r,true)}
}
