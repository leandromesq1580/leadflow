'use client'
import React,{useState,useEffect,useCallback} from 'react'
import {sequenceJSON} from '@/lib/sequence-client'
type Enrollment={id:string;lead_id:string;status:string;next_run_at:string;stop_reason:string|null;generation_status:string;delivery_status:string;current_step:number;leads:{name:string}|null}
export function SequenceEnrollmentPanel({sequenceId,enabled}:{sequenceId:string;enabled:boolean}){
 const [rows,setRows]=useState<Enrollment[]>([])
 const [leads,setLeads]=useState<{id:string;name:string;lead_language:string}[]>([])
 const [query,setQuery]=useState('')
 const [lead,setLead]=useState('')
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 const load=useCallback(async()=>{const r=await sequenceJSON(`/api/sequences/enroll?sequence_id=${sequenceId}`);setRows(r.enrollments)},[sequenceId])
 useEffect(()=>{load().catch(e=>setError(e.message))},[load])
 async function act(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function search(){const r=await sequenceJSON(`/api/sequences/enroll?leads=1&q=${encodeURIComponent(query)}`);setLeads(r.leads);setLead('')}
 async function enroll(){await sequenceJSON('/api/sequences/enroll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sequence_id:sequenceId,lead_id:lead})});setLead('');await load()}
 async function stop(id:string){await sequenceJSON(`/api/sequences/enroll?enrollment_id=${id}`,{method:'DELETE'});await load()}
 return <section className="mt-4 border-t pt-3 space-y-3 text-sm">
  <p>Inscrições (últimas 200). Leads respondidos, opt-out ou parados manualmente não são reativados pela IA.</p>
  <div className="flex flex-wrap gap-2"><input aria-label="Buscar lead" placeholder="Buscar lead pelo nome" value={query} onChange={e=>setQuery(e.target.value)} className="border rounded p-2 bg-transparent"/><button disabled={busy} onClick={()=>act(search)}>Buscar lead (até 50)</button>
  <select aria-label="Lead para inscrição" value={lead} onChange={e=>setLead(e.target.value)}><option value="">Selecione um lead</option>{leads.map(l=><option key={l.id} value={l.id}>{l.name} · {l.lead_language||'idioma pendente'}</option>)}</select>
  <button disabled={busy||!lead||!enabled} onClick={()=>act(enroll)}>Inscrever</button><button disabled={busy} onClick={()=>act(load)}>Atualizar inscrições</button></div>
  {!enabled&&<p>Ative a sequência antes de inscrever. Ativar não inscreve leads retroativamente.</p>}
  {error&&<p role="alert" className="text-red-600">{error}</p>}
  <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Lead</th><th>Status / motivo</th><th>Geração / entrega</th><th>Próximo envio (horário da Flórida)</th><th>Ação</th></tr></thead><tbody>{rows.map(e=><tr key={e.id}><td>{e.leads?.name||'Lead'}<br/>{e.current_step} enviados/passos</td><td>{e.status}<br/>{e.stop_reason||'—'}</td><td>{e.generation_status} / {e.delivery_status}</td><td>{e.status==='active'?new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'2-digit',day:'2-digit',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(e.next_run_at)):'—'}</td><td>{['active','paused'].includes(e.status)&&<button disabled={busy} onClick={()=>act(()=>stop(e.id))}>Parar</button>}</td></tr>)}</tbody></table></div>
  <p className="text-xs">Entrega não confirmada exige conferência humana no WhatsApp; não há reenvio automático nem botão de retomada. Uma mensagem já em transporte não pode ser recolhida.</p>
 </section>
}
