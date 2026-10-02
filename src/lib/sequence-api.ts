import type { createAdminClient } from './supabase/admin'
import { nextSendAt, validateAIConfig, AISequenceConfigError } from './ai-sequence-config'
import { generateSequenceCopy, AISequenceGenerationError } from './ai-sequence-copy'
type Db=ReturnType<typeof createAdminClient>
type Operation='list'|'save'|'remove'|'enroll'|'stop'|'enrollments'|'preview'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
class ApiError extends Error { constructor(public status:number,message:string){super(message)} }
function validId(id:unknown):asserts id is string {if(typeof id!=='string'||!uuid.test(id))throw new ApiError(400,'Identificador inválido.')}
function checked<T>(result:{data:T;error:{code?:string}|null}):T {
 if(result.error)throw new ApiError(result.error.code==='42501'?403:result.error.code==='22023'?400:['23505','23514'].includes(result.error.code||'')?409:503,'Operação não concluída. Confira propriedade, estado e configuração; tente recarregar.')
 return result.data
}
/** Session identity is authoritative, including admin accounts. SQL rechecks references atomically. */
export function sequenceAPI(db:Db,caller:()=>Promise<{id:string;isAdmin:boolean}|null>,generate=generateSequenceCopy){
 return async(op:Operation,request:Request,id?:string):Promise<Response>=>{
  try{
   const session=await caller()
   if(!session)throw new ApiError(401,'Faça login para continuar.')
   const buyer=session.id
   const url=new URL(request.url)
   if(url.searchParams.get('buyer_id') && url.searchParams.get('buyer_id')!==buyer)throw new ApiError(403,'Acesso negado.')
   let body:Record<string,unknown>={}
   if(['save','enroll','preview'].includes(op)){
    try{body=await request.json();if(!body||Array.isArray(body)||typeof body!=='object')throw Error()}catch{throw new ApiError(400,'JSON inválido.')}
    if(body.buyer_id!==undefined && body.buyer_id!==buyer)throw new ApiError(403,'Acesso negado.')
   }
   if(id)validId(id)
   if(op==='list'){
    const sequences=checked(await db.from('sequences').select('*, sequence_steps(*)').eq('buyer_id',buyer).order('created_at',{ascending:false})) || []
    const pipelines=checked(await db.from('pipelines').select('id,name,is_default,stages:pipeline_stages(*)').eq('buyer_id',buyer)) || []
    const templates=checked(await db.from('templates').select('id,name,type').or(`buyer_id.eq.${buyer},and(is_system.eq.true,buyer_id.is.null)`)) || []
    return Response.json({buyer_id:buyer,sequences:sequences.map(s=>({...s,sequence_steps:(s.sequence_steps || []).sort((a:{step_order:number},b:{step_order:number})=>a.step_order-b.step_order)})),pipelines,templates})
   }
   if(op==='preview'){
    const sampleCount=body.sample_count===undefined?1:body.sample_count
    if(typeof sampleCount!=='number'||!Number.isInteger(sampleCount)||sampleCount<1||sampleCount>6)throw new ApiError(400,'Quantidade de amostras inválida (1 a 6).')
    if(sampleCount>1&&session.isAdmin!==true)throw new ApiError(403,'Acesso negado.')
    let config: ReturnType<typeof validateAIConfig> | undefined
    try {
     config=validateAIConfig(body.ai_config)
     if(!['pt','es','en'].includes(String(body.locale)))throw new AISequenceGenerationError('AI_LOCALE_INVALID')
     const samples:Array<{body:string;choice:string}>=[]
     let recentChoices:string[]=[]
     for(let i=0;i<sampleCount;i++){
      const result=await generate(config,{lead_language:String(body.locale)},recentChoices)
      samples.push({body:result.body,choice:result.choice})
      recentChoices=[...recentChoices,result.choice].slice(-3)
     }
     return Response.json(sampleCount===1?{...samples[0],sent:false}:{samples,sent:false})
    }catch(error){
     if (error instanceof AISequenceConfigError) {
      console.error('[ai-sequence-preview]',{code:error.code,status:error.status})
      return Response.json({error:error.message,code:error.code,sent:false},{status:error.status})
     }
     const safe = error instanceof AISequenceGenerationError ? error : new AISequenceGenerationError('AI_INTERNAL_ERROR')
     console.error('[ai-sequence-preview]', {code:safe.code,status:safe.status,...(config ? {model:config.model} : {}),
      ...(safe.providerStatus === undefined ? {} : {provider_status:safe.providerStatus}),
      ...(safe.requestId === undefined ? {} : {request_id:safe.requestId}),
       ...(safe.reason === undefined ? {} : {reason:safe.reason})})
     return Response.json({error:safe.message,code:safe.code,...(safe.reason === undefined ? {} : {reason:safe.reason}),sent:false},{status:safe.status})
    }
   }
   if(op==='save'){
    const config:Record<string,unknown>={}
    for(const key of ['name','description','enabled','trigger_stage_id','reply_stage_id','mode','ai_config'])if(body[key]!==undefined)config[key]=body[key]
    if((!id||config.name!==undefined)&&(typeof config.name!=='string'||!config.name.trim()||config.name.length>120))throw new ApiError(400,'Nome obrigatório (até 120 caracteres).')
    if(config.enabled!==undefined&&typeof config.enabled!=='boolean')throw new ApiError(400,'Estado inválido.')
    if(config.description!==undefined&&config.description!==null&&(typeof config.description!=='string'||config.description.length>1000))throw new ApiError(400,'Descrição inválida.')
    if(config.trigger_stage_id!==undefined && config.trigger_stage_id!==null)validId(config.trigger_stage_id)
    if(config.reply_stage_id!==undefined && config.reply_stage_id!==null)validId(config.reply_stage_id)
    if(config.mode!==undefined&&!['legacy','ai_until_reply'].includes(String(config.mode)))throw new ApiError(400,'Modo inválido.')
    if(config.ai_config!==undefined||config.mode==='ai_until_reply'){
     config.ai_config=validateAIConfig(config.ai_config)
    }
    let steps=null
    if(body.steps!==undefined){
     if(!Array.isArray(body.steps)||body.steps.length>30)throw new ApiError(400,'Passos inválidos.')
     steps=body.steps.map((s:Record<string,unknown>)=>{
      if(!s||!Number.isInteger(s.delay_hours)||Number(s.delay_hours)<0||Number(s.delay_hours)>8760||!['wait','notify_agent','send_template'].includes(String(s.step_type)))throw new ApiError(400,'Passo inválido.')
      if(s.template_id)validId(s.template_id)
      if(s.custom_body && (typeof s.custom_body!=='string'||s.custom_body.length>4000))throw new ApiError(400,'Mensagem inválida.')
      if(s.step_type==='send_template'&&!s.template_id&&!s.custom_body)throw new ApiError(400,'Escolha um modelo ou mensagem.')
      return {delay_hours:s.delay_hours,step_type:s.step_type,template_id:s.template_id||null,custom_body:s.custom_body||null}
     })
    }
    if(!id&&config.mode!=='ai_until_reply'&&!steps?.length)throw new ApiError(400,'Inclua pelo menos um passo.')
    const sequence=checked(await db.rpc('save_sequence',{p_buyer:buyer,p_id:id||null,p_config:config,p_steps:steps}))
    return Response.json({sequence})
   }
   if(op==='remove'){
    if(!id)throw new ApiError(400,'Identificador obrigatório.')
    const rows=checked(await db.from('sequences').delete().eq('id',id).eq('buyer_id',buyer).select('id'))
    if(!rows?.length)throw new ApiError(404,'Sequência não encontrada.')
    return Response.json({success:true})
   }
   if(op==='enrollments'){
    if(url.searchParams.get('leads')==='1'){
     const q=(url.searchParams.get('q')||'').trim().replace(/[%_(),]/g,'').slice(0,80)
     let query=db.from('leads').select('id,name,lead_language').eq('assigned_to',buyer).is('assigned_to_member',null).eq('archived',false).order('name').limit(50)
     if(q)query=query.ilike('name',`%${q}%`)
     return Response.json({leads:checked(await query)||[]})
    }
    const sequence=url.searchParams.get('sequence_id');validId(sequence)
    const rows=checked(await db.from('sequence_enrollments').select('id,lead_id,status,current_step,next_run_at,stop_reason,generation_status,delivery_status,attempts,last_sent_at,leads(name)').eq('buyer_id',buyer).eq('sequence_id',sequence).order('enrolled_at',{ascending:false}).limit(200))
    return Response.json({enrollments:rows||[]})
   }
   if(op==='stop'){
    const enrollment=url.searchParams.get('enrollment_id');validId(enrollment)
    if(!checked(await db.rpc('stop_sequence_enrollment',{p_buyer:buyer,p_id:enrollment})))throw new ApiError(404,'Inscrição não encontrada.')
    return Response.json({success:true})
   }
   validId(body.sequence_id);validId(body.lead_id)
   const s=checked(await db.from('sequences').select('id,mode,ai_config,sequence_steps(delay_hours,step_order)').eq('id',body.sequence_id).eq('buyer_id',buyer).maybeSingle())
   if(!s)throw new ApiError(404,'Sequência não encontrada.')
   let due:Date
   if(s.mode==='ai_until_reply'){
    const c=validateAIConfig(s.ai_config);due=nextSendAt(new Date(Date.now()+c.initial_delay_minutes*60000),c)
   }else{
    const step=(s.sequence_steps||[]).sort((a:{step_order:number},b:{step_order:number})=>a.step_order-b.step_order)[0]
    due=new Date(Date.now()+(step?.delay_hours||0)*3600000)
   }
   const enrollment=checked(await db.rpc('enroll_sequence',{p_buyer:buyer,p_sequence:body.sequence_id,p_lead:body.lead_id,p_due:due.toISOString()}))
   return Response.json({enrollment})
  }catch(e){
   if (e instanceof AISequenceConfigError) return Response.json({error:e.message,code:e.code},{status:e.status})
   return Response.json({error:e instanceof ApiError?e.message:'Operação indisponível. Nenhuma confirmação de sucesso.'},{status:e instanceof ApiError?e.status:503})}
 }
}
