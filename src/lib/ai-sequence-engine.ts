import { nextSendAt, validateAIConfig, type AISequenceConfig } from './ai-sequence-config'
import { generateSequenceCopy } from './ai-sequence-copy'
import type { LeadLanguageFields } from './lead-message-locale'
import type { createAdminClient } from './supabase/admin'
import { getBridgeForBuyer, type BridgeConfig } from './wa-bridge'
import { checkSendRate } from './send-guard'
export interface AIEnrollment { id:string; buyer_id:string; lead_id:string; sequence_id:string; lease_token:string; current_step:number; recent_choices:string[] }
type Context = {config:AISequenceConfig;lead:LeadLanguageFields;phone:string}
type Sent = {id:string;from:string;to:string}
export interface AIEnginePorts {
  now(): Date
  claim(id:string):Promise<AIEnrollment|null>
  context(e:AIEnrollment):Promise<Context>
  ready(e:AIEnrollment):Promise<void>
  generate(c:AISequenceConfig,l:LeadLanguageFields,recent:string[]):Promise<{body:string;choice:string}>
  begin(e:AIEnrollment,body:string):Promise<boolean>
  send(e:AIEnrollment,c:Context,body:string):Promise<Sent>
  finish(e:AIEnrollment,sent:Sent,choice:string,next:Date):Promise<void>
  defer(e:AIEnrollment,reason:string,next:Date,unknown:boolean):Promise<void>
}
/** One claim for cron AND inline. Once transport starts, any ambiguity pauses for a human. */
export async function runAIEnrollment(id:string, io:AIEnginePorts):Promise<boolean> {
  const e=await io.claim(id)
  if(!e)return false
  let sending=false
  let phase='configuration_failed'
  try{
    const ctx=await io.context(e)
    const c=validateAIConfig(ctx.config)
    let now=io.now()
    let allowed=nextSendAt(now,c)
    if(allowed.getTime()>now.getTime()){await io.defer(e,'outside_window',allowed,false);return false}
    phase='bridge_or_rate_unavailable'
    await io.ready(e)
    phase='generation_unavailable'
    const generated=await io.generate(c,ctx.lead,e.recent_choices || [])
    now=io.now();allowed=nextSendAt(now,c)
    if(allowed.getTime()>now.getTime()){await io.defer(e,'outside_window',allowed,false);return false}
    // This is the final atomic permission check. No recall is possible after transport starts.
    if(!await io.begin(e,generated.body))return false
    sending=true
    const sent=await io.send(e,ctx,generated.body)
    const next=nextSendAt(new Date(io.now().getTime()+c.repeat_minutes*60000),c)
    await io.finish(e,sent,generated.choice,next)
    return true
  }catch{
    await io.defer(e,sending?'delivery_unknown':phase,new Date(io.now().getTime()+3600000),sending)
    return false
  }
}

type Db=ReturnType<typeof createAdminClient>
export function aiEnginePorts(db:Db):AIEnginePorts {
  let bridge:BridgeConfig|null=null
  async function rpc(name:string,args:Record<string,unknown>) {
    const {data,error}=await db.rpc(name,args)
    if(error)throw new Error(`Sequence storage unavailable: ${error.code}`)
    return data
  }
  return {
    now:()=>new Date(),
    claim:async id=>(await rpc('claim_ai_sequence',{p_id:id}))?.[0] || null,
    context:async e=>{
      const [{data:s,error:se},{data:l,error:le}]=await Promise.all([
        db.from('sequences').select('ai_config').eq('id',e.sequence_id).eq('buyer_id',e.buyer_id).single(),
        db.from('leads').select('phone, lead_language, form_name, meta_lead_id').eq('id',e.lead_id).eq('assigned_to',e.buyer_id).single(),
      ])
      if(se||le||!s||!l?.phone)throw new Error('Context unavailable')
      return {config:validateAIConfig(s.ai_config),lead:l,phone:l.phone}
    },
    ready:async e=>{
      const rate=await checkSendRate(db,e.buyer_id)
      if(!rate.ok)throw new Error('Rate limited')
      bridge=await getBridgeForBuyer(db,e.buyer_id)
      if(!bridge)throw new Error('Own bridge unavailable')
      const response=await fetch(`${bridge.url}/status`,{headers:{apikey:bridge.key},signal:AbortSignal.timeout(5000)})
      if(!response.ok || (await response.json())?.ready!==true)throw new Error('Bridge offline')
    },
    generate:generateSequenceCopy,
    begin:async(e,body)=>!!(await rpc('begin_ai_send',{p_id:e.id,p_token:e.lease_token,p_body:body}))?.length,
    send:async(e,ctx,body)=>{
      if(!bridge || bridge.ownerBuyerId!==e.buyer_id)throw new Error('No own bridge')
      const to=ctx.phone.replace(/\D/g,'')
      const response=await fetch(`${bridge.url}/send`,{method:'POST',headers:{apikey:bridge.key,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({number:to,message:body})})
      if(!response.ok)throw new Error('Delivery not confirmed')
      const result=await response.json()
      if(typeof result.id!=='string'||!result.id)throw new Error('Missing delivery confirmation')
      return {id:result.id,from:bridge.phone || '',to}
    },
    finish:async(e,sent,choice,next)=>{if(!await rpc('finish_ai_send',{p_id:e.id,p_token:e.lease_token,p_wa:sent.id,p_choice:choice,p_next:next.toISOString(),p_from:sent.from,p_to:sent.to}))throw new Error('Confirmation not persisted')},
    defer:async(e,reason,next,unknown)=>{await rpc('defer_ai_sequence',{p_id:e.id,p_token:e.lease_token,p_reason:reason,p_next:next.toISOString(),p_unknown:unknown})},
  }
}
