'use client'

import {useEffect,useRef,useState} from 'react'
import {ChevronDown,RefreshCw} from '@/components/admin/campaign-icons'
function Sparkles({size=16}:{size?:number}) {return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4m-2-2h4"/></svg>}
import type {CampaignAICopy} from '@/lib/email-campaign-ai'

interface Props { disabled:boolean;hasContent:boolean;onApply:(copy:CampaignAICopy)=>void }
const field='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-emerald-900'
const button='inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50'
const failure='Não foi possível gerar os textos. Seu rascunho foi preservado; tente novamente.'

export default function EmailCampaignAIGenerator({disabled,hasContent,onApply}:Props) {
  const [insurance,setInsurance]=useState('Seguro'),[theme,setTheme]=useState(''),[phone,setPhone]=useState('1 863 280 8696')
  const [loading,setLoading]=useState(false),[copy,setCopy]=useState<CampaignAICopy|null>(null),[error,setError]=useState(''),[locale,setLocale]=useState<'pt'|'es'>('pt'),[applied,setApplied]=useState(false)
  const generation=useRef(0),controller=useRef<AbortController|null>(null)
  useEffect(()=>()=>{generation.current++;controller.current?.abort()},[])
  function edit(setter:(value:string)=>void,value:string) {setter(value);setCopy(null);setApplied(false);setError('')}
  async function generate() {
    const id=++generation.current
    controller.current?.abort();const abort=new AbortController();controller.current=abort
    setLoading(true);setError('');setCopy(null);setApplied(false)
    const timer=setTimeout(()=>abort.abort(),35000)
    try {
      const response=await fetch('/api/admin/email-campaigns/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({insurance,theme,phone}),signal:abort.signal})
      const data=await response.json()
      if (generation.current!==id) return
      if (!response.ok) {setError(typeof data.error==='string'?data.error:failure);return}
      if (!data.copy || !['name','subject_pt','body_pt','subject_es','body_es'].every(k=>typeof data.copy[k]==='string'&&data.copy[k].trim())) {setError(failure);return}
      setCopy(data.copy)
    } catch {if(generation.current===id)setError(failure)}
    finally {clearTimeout(timer);if(generation.current===id)setLoading(false)}
  }
  function apply() {
    if (!copy || disabled || loading) return
    if (hasContent && !window.confirm('Substituir os assuntos e textos atuais nos dois idiomas? O nome da campanha e os filtros serão preservados. Nada será salvo ou enviado.')) return
    onApply(copy);setApplied(true)
  }
  return <details className="rounded-lg border border-emerald-100 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20">
    <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-medium text-emerald-800 dark:text-emerald-300"><Sparkles size={16}/>Gerar com IA<ChevronDown size={14} className="ml-auto"/></summary>
    <div className="space-y-4 px-3 pb-4">
      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">Assunto e mensagem nos dois idiomas para incentivar contato ou cotação. Nada é salvo ou enviado ao gerar.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">Tipo de seguro<input aria-label="Tipo de seguro para IA" className={'mt-1 '+field} maxLength={100} value={insurance} disabled={disabled||loading} onChange={e=>edit(setInsurance,e.target.value)} placeholder="Ex.: seguro de vida"/></label>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">WhatsApp de atendimento<input aria-label="WhatsApp de atendimento para IA" type="tel" className={'mt-1 '+field} maxLength={32} value={phone} disabled={disabled||loading} onChange={e=>edit(setPhone,e.target.value)}/></label>
      </div>
      <label className="block text-xs font-medium text-slate-700 dark:text-slate-200">Orientação geral (opcional)<textarea aria-label="Orientação geral para IA" className={'mt-1 min-h-20 resize-y '+field} maxLength={500} value={theme} disabled={disabled||loading} onChange={e=>edit(setTheme,e.target.value)} placeholder="Ex.: uma abordagem tranquila para quem quer entender suas opções."/><span className="mt-1 block font-normal text-slate-500">Não inclua nomes, contatos nem dados pessoais de leads.</span></label>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">Português + espanhol · revise antes de aplicar</span><button type="button" className={button} disabled={disabled||loading||!insurance.trim()||!phone.trim()} onClick={()=>void generate()}>{loading?<><RefreshCw size={15} className="animate-spin"/>Gerando textos…</>:<><Sparkles size={15}/>{copy?'Gerar outra versão':'Gerar sugestões'}</>}</button></div>
      {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
      {copy&&<div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex gap-2">{(['pt','es'] as const).map(l=><button key={l} type="button" aria-pressed={locale===l} className={'rounded-md px-3 py-1.5 text-xs font-medium '+(locale===l?'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200':'text-slate-500 dark:text-slate-400')} onClick={()=>setLocale(l)}>{l==='pt'?'Prévia em português':'Vista en español'}</button>)}</div>
        <p data-testid="ai-subject" className="break-words text-sm font-semibold text-slate-900 dark:text-white">{copy[`subject_${locale}`]}</p>
        <p data-testid="ai-body" className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600 dark:text-slate-300">{copy[`body_${locale}`]}</p>
        <p className="text-xs leading-relaxed text-slate-500">Confira os fatos e o destino do WhatsApp. O texto é uma sugestão, não uma validação de preços ou coberturas.</p>
        <button type="button" className={button+' w-full'} disabled={disabled||loading||applied} onClick={apply}>{applied?'Aplicado ao rascunho':'Usar textos no rascunho'}</button>
        {applied&&<p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">Revise no editor e salve quando estiver pronto. Nenhum e-mail foi enviado.</p>}
      </div>}
    </div>
  </details>
}
