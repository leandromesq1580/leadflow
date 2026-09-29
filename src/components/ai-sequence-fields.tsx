'use client'
import React, {useState} from 'react'
import type {AISequenceConfig} from '@/lib/ai-sequence-config'
import {sequenceJSON} from '@/lib/sequence-client'
const field='w-full border rounded p-2 bg-transparent text-sm'
export function AISequenceFields({value:c,onChange}:{value:AISequenceConfig;onChange:(c:AISequenceConfig)=>void}){
 const [locale,setLocale]=useState('pt')
 const [preview,setPreview]=useState('')
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const update=(v:Partial<AISequenceConfig>)=>{onChange({...c,...v});setPreview('')}
 async function example(){
  setBusy(true);setError('');setPreview('')
  try{const r=await sequenceJSON('/api/sequences/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ai_config:c,locale})});setPreview(r.body)}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <section className="space-y-3 border rounded-xl p-4">
  <p className="text-sm">WhatsApp até responder. Qualquer resposta (texto, áudio ou imagem) encerra a IA e o humano assume. A assistente se identifica como IA. A criação fica desativada até você ativar.</p>
  <label className="block">Objetivo<select className={field} value={c.goal} onChange={e=>update({goal:e.target.value as AISequenceConfig['goal']})}><option value="call">Obter ligação</option><option value="meeting">Combinar reunião</option></select></label>
  <label className="block">Brief curto do corretor<textarea className={field} maxLength={300} value={c.brief} onChange={e=>update({brief:e.target.value})} placeholder="Proteção familiar em linguagem simples, sem dados pessoais"/></label>
  <p className="text-xs">A IA redige mensagens novas e curtas para obter ligação ou reunião. O brief comercial (até 300 caracteres) é enviado ao modelo e orienta conteúdo e tom. Não inclua nomes, dados pessoais/sensíveis, telefone, email, renda, saúde ou conversas. Filtros retêm padrões de risco, mas não garantem toda interpretação; revise o exemplo.</p>
  <div className="grid grid-cols-2 gap-3">
   <label>Espera inicial (min)<input className={field} type="number" min={0} max={43200} value={c.initial_delay_minutes} onChange={e=>update({initial_delay_minutes:Number(e.target.value)})}/></label>
   <label>Intervalo entre envios (min)<input className={field} type="number" min={60} max={43200} value={c.repeat_minutes} onChange={e=>update({repeat_minutes:Number(e.target.value)})}/></label>
  </div>
  <label className="block">Fuso IANA da janela de envio<input className={field} value={c.timezone} onChange={e=>update({timezone:e.target.value})}/></label>
  <p className="text-xs">Esta janela controla mensagens, não o recebimento de leads. O próximo envio parte do envio confirmado; o cron pode levar cerca de 5 minutos.</p>
  <fieldset><legend>Dias de envio</legend><div className="flex flex-wrap gap-3">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((day,n)=><label key={day}><input type="checkbox" checked={c.days.includes(n)} onChange={e=>update({days:e.target.checked?[...c.days,n]:c.days.filter(d=>d!==n)})}/> {day}</label>)}</div></fieldset>
  <div className="grid grid-cols-2 gap-3"><label>Início<input type="time" className={field} value={c.start} onChange={e=>update({start:e.target.value})}/></label><label>Fim (exclusivo)<input type="time" className={field} value={c.end} onChange={e=>update({end:e.target.value})}/></label></div>
  <label className="block"><input type="checkbox" checked={c.stop_on_stage_exit} onChange={e=>update({stop_on_stage_exit:e.target.checked})}/> Parar ao sair do estágio gatilho</label>
  <label className="block">URL de agendamento (HTTPS, opcional)<input className={field} type="url" maxLength={250} value={c.booking_url} onChange={e=>update({booking_url:e.target.value})}/></label>
  <div className="flex gap-3"><select aria-label="Idioma do exemplo" value={locale} onChange={e=>setLocale(e.target.value)}><option value="pt">Português</option><option value="es">Español</option><option value="en">English</option></select><button type="button" disabled={busy} onClick={example} className="border rounded px-3 py-2">{busy?'Gerando…':'Gerar exemplo (não envia)'}</button></div>
  <p className="text-xs">Envios reais seguem o idioma cadastrado do lead, nunca o idioma deste exemplo.</p>
  {error&&<p role="alert" className="text-red-600">{error}</p>}{preview&&<blockquote className="border-l-4 pl-3 whitespace-pre-wrap">{preview}</blockquote>}
 </section>
}
