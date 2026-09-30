'use client'

import { useId } from 'react'
import type { usePipelineOrder } from '@/lib/use-pipeline-order'
export function PipelineOrderControl({order,locale,disabled=false,mobile=false}:{order:ReturnType<typeof usePipelineOrder>;locale:string;disabled?:boolean;mobile?:boolean}) {
  const id=useId()
  const L=(pt:string,en:string,es:string)=>locale==='en'?en:locale==='es'?es:pt
  const newest=L('Mais novos','Newest','Más nuevos')
  const recent=L('Conversas recentes','Recent conversations','Conversaciones recientes')
  const fg=mobile?'var(--m-text)':'var(--fg-secondary)'
  const muted=mobile?'var(--m-muted)':'var(--fg-muted)'
  const bg=mobile?'var(--m-bg)':'var(--bg-card)'
  const border=mobile?'var(--m-border)':'var(--border)'
  const hint=L('Última mensagem enviada ou recebida no WhatsApp. Sem conversa: mais novos primeiro.','Latest message sent or received on WhatsApp. No conversation: newest first.','Último mensaje enviado o recibido por WhatsApp. Sin conversación: más nuevos primero.')
  const problem=order.status==='error'||order.status==='restricted'
  const pending=order.mode==='conversation'&&(order.status==='loading'||order.status==='refreshing')
  const message=order.status==='restricted'
    ? L('Conversas restritas nesta conta ou neste funil. Exibindo mais novos.','Conversations are restricted for this account or board. Showing newest first.','Conversaciones restringidas para esta cuenta o embudo. Mostrando más nuevos.')
    : order.status==='error'
      ? L('Conversas indisponíveis. Exibindo mais novos; nenhuma data foi presumida.','Conversations unavailable. Showing newest first; no dates were assumed.','Conversaciones no disponibles. Mostrando más nuevos; no se asumieron fechas.')
      : L('Atualizando conversas do WhatsApp…','Refreshing WhatsApp conversations…','Actualizando conversaciones de WhatsApp…')
  return <div style={{display:'inline-flex',alignItems:'center',gap:5,position:'relative',maxWidth:'100%',flexShrink:1,color:muted,fontSize:12}}>
    <label style={{display:'inline-flex',alignItems:'center',gap:4,minWidth:0,whiteSpace:'nowrap'}} title={hint}>
      <span>{L('Ordenar:','Sort:','Ordenar:')}</span>
      <select aria-label={L('Ordenar','Sort','Ordenar')} aria-describedby={id} value={order.mode} disabled={disabled||!order.identityReady}
        onChange={event=>order.setMode(event.target.value==='conversation'?'conversation':'newest')}
        style={{font:'inherit',fontWeight:600,color:fg,background:'transparent',border:0,padding:'5px 0',width:`${(order.mode==='newest'?newest:recent).length+3}ch`,maxWidth:'100%',cursor:'pointer'}}>
        <option value="newest" style={{background:bg,color:fg}}>{newest}</option>
        <option value="conversation" style={{background:bg,color:fg}}>{recent}</option>
      </select>
    </label>
    <span id={id} className="sr-only">{hint}{(problem||pending)?' '+message:''}</span>
    {(problem||pending)&&<details style={{position:'relative',flexShrink:0}}>
      <summary aria-label={message} title={message} style={{cursor:'pointer',listStyle:'none',fontWeight:700,padding:'4px'}}>{problem?'ⓘ':'…'}</summary>
      <div role="status" style={{position:'absolute',right:0,top:'100%',zIndex:40,width:'min(270px, calc(100vw - 40px))',padding:12,borderRadius:10,background:bg,color:fg,border:`1px solid ${border}`,boxShadow:'0 5px 20px #0002',whiteSpace:'normal',lineHeight:1.5}}>
        {message}
        {order.status==='error'&&<button type="button" onClick={order.retry} style={{display:'block',textDecoration:'underline',marginTop:6}}>{L('Tentar novamente','Try again','Intentar de nuevo')}</button>}
      </div>
    </details>}
  </div>
}
