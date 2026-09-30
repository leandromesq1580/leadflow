import type { AISequenceConfig } from './ai-sequence-config'

interface SequenceSeed {
 name: string
 description: string | null
 mode?: 'legacy' | 'ai_until_reply'
 ai_config?: AISequenceConfig
 trigger_stage_id?: string | null
 sequence_steps: { delay_hours: number; template_id: string | null; custom_body: string | null; step_type: 'send_template' | 'wait' | 'notify_agent' }[]
}
/** Copy configuration only: never execution state or persisted identities. */
export function duplicateSequenceDraft(source: SequenceSeed, locale: string) {
 const suffix = locale === 'en' ? ' (copy)' : locale === 'es' ? ' (copia)' : ' (cópia)'
 return structuredClone({
  name: source.name.slice(0, 120 - suffix.length) + suffix,
  description: source.description,
  enabled: false as const,
  mode: source.mode ?? 'legacy',
  ai_config: source.ai_config,
  trigger_stage_id: source.trigger_stage_id,
  sequence_steps: source.sequence_steps.map(({delay_hours, template_id, custom_body, step_type}) => ({delay_hours, template_id, custom_body, step_type})),
 })
}

export async function sequenceJSON(url:string,init?:RequestInit,send:typeof fetch=fetch){
 const r=await send(url,init)
 const data=await r.json().catch(()=>({}))
 if(!r.ok)throw new Error(data.error||`Falha HTTP ${r.status}`)
 return data
}
export async function saveSequenceDraft(url:string,payload:unknown,close:()=>void,reload:()=>Promise<void>,send:typeof fetch=fetch){
 await sequenceJSON(url,{method:url==='/api/sequences'?'POST':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)},send)
 close()
 try{await reload()}catch{throw new Error('Salvo, mas não foi possível recarregar a lista. Atualize a página; não salve novamente.')}
}
