'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mail, Plus, ArrowLeft, RefreshCw, CheckCircle2, AlertCircle, Pause, Play, Ban, Eye, ChevronDown } from '@/components/admin/campaign-icons'
import { CampaignDraft, CampaignFilters, validateCampaign } from '@/lib/email-campaigns'

type Stats=Record<string,number>
type Audience={total_leads:number;eligible:number;pt:number;es:number;exclusions:Record<string,number>}
type Campaign=CampaignDraft & {id:string;state:string;scheduled_at:string|null;stats:Stats;audience_snapshot:Audience|null}
type Recipient={id:string;name:string;email:string;language:string;state:string;reason:string|null}
type Configuration={ready:boolean;issues:string[];from:string;dailyLimit:number;domainVerified:boolean}
const empty=():CampaignDraft=>({name:'',subject_pt:'',body_pt:'',subject_es:'',body_es:'',filters:{}})
const stateLabels:Record<string,string>={draft:'Rascunho',scheduled:'Agendada',running:'Em processamento',paused:'Pausada',cancelled:'Cancelada',completed:'Processada',pending:'Na fila',reserved:'Na fila',sending:'Envio em andamento',accepted:'Aceito pelo provedor',delivered:'Entregue',bounced:'Endereço recusado',complained:'Reclamação',refused:'Recusado pelo provedor',unknown:'Resultado incerto',suppressed:'Bloqueado',cancelled_recipient:'Cancelado'}
const exclusionLabels:Record<string,string>={missing_email:'Sem e-mail',invalid_email:'Endereço inválido',duplicate:'Cadastro repetido',language:'Idioma ausente ou conflitante',suppressed:'Descadastro / endereço bloqueado',permission:'Sem permissão registrada'}
const inputClass='w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-emerald-900'
const secondary='inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
const primary='inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40'
function campaignDraft(c:Campaign):CampaignDraft{return {name:c.name,subject_pt:c.subject_pt,body_pt:c.body_pt,subject_es:c.subject_es,body_es:c.body_es,filters:c.filters}}
function Badge({state}:{state:string}){return <span className={`rounded-full px-2 py-1 text-xs font-medium ${state==='running'?'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300':state==='paused'?'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300':'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{stateLabels[state]||state}</span>}

export default function EmailCampaignsPage(){
 const [campaigns,setCampaigns]=useState<Campaign[]>([]),[total,setTotal]=useState(0),[listPage,setListPage]=useState(0)
 const [active,setActive]=useState<Campaign|null>(null),[editing,setEditing]=useState(false),[draft,setDraft]=useState<CampaignDraft>(empty)
 const [dirty,setDirty]=useState(false),[locale,setLocale]=useState<'pt'|'es'>('pt'),[audience,setAudience]=useState<Audience|null>(null)
 const [config,setConfig]=useState<Configuration|null>(null),[buyers,setBuyers]=useState<{id:string;name:string}[]>([])
 const [recipients,setRecipients]=useState<Recipient[]>([]),[recipientPage,setRecipientPage]=useState(0),[recipientTotal,setRecipientTotal]=useState(0)
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [evidence,setEvidence]=useState(''),[permissionConfirmed,setPermissionConfirmed]=useState(false),[scheduleConfirmed,setScheduleConfirmed]=useState(false),[scheduleAt,setScheduleAt]=useState('')
 const busyRef=useRef(false),generation=useRef(0)
 const editable=!active||active.state==='draft'
 const load=useCallback(async(id?:string,page=0,applyEditor=false)=>{
  const sequence=++generation.current
  try{
   const r=await fetch(`/api/admin/email-campaigns?page=${page}${id?'&id='+id:''}`,{cache:'no-store'})
   const d=await r.json();if(!r.ok)throw new Error(d.error||'Falha ao carregar campanhas.')
   if(sequence!==generation.current)return
   setConfig(d.configuration);setBuyers(d.buyers||[])
   if(id){
    const c=d.campaigns[0];if(!c)throw new Error('Campanha não encontrada.')
    setActive(c);setRecipients(d.recipients);setRecipientTotal(d.total_recipients);setRecipientPage(page)
    if(applyEditor){setDraft(campaignDraft(c));setDirty(false);setAudience(c.audience_snapshot);setEditing(true);setScheduleConfirmed(false);setScheduleAt('')}
   }else{setCampaigns(d.campaigns);setTotal(d.total_campaigns);setListPage(page)}
  }catch(e){if(sequence===generation.current)setError(e instanceof Error?e.message:'Falha ao carregar.')}
  finally{if(sequence===generation.current)setLoading(false)}
 },[])
 useEffect(()=>{void load();return()=>{generation.current++}},[load])
 async function execute(action:()=>Promise<void>){
  if(busyRef.current)return
  busyRef.current=true;setBusy(true);setError('');setNotice('')
  try{await action()}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir.')}
  finally{busyRef.current=false;setBusy(false)}
 }
 async function post(body:unknown){const r=await fetch('/api/admin/email-campaigns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível concluir.');return d}
 function change(key:keyof CampaignDraft,value:unknown){setDraft(d=>({...d,[key]:value}));setDirty(true);setScheduleConfirmed(false);if(key==='filters'){setAudience(null);setPermissionConfirmed(false)}}
 function filter(key:keyof CampaignFilters,value:unknown){const f={...draft.filters};if(value===''||(Array.isArray(value)&&value.length===0))delete f[key];else Object.assign(f,{[key]:value});change('filters',f)}
 function newCampaign(){generation.current++;setEditing(true);setActive(null);setDraft(empty());setDirty(false);setAudience(null);setRecipients([]);setError('');setNotice('');setEvidence('');setPermissionConfirmed(false);setScheduleConfirmed(false);setScheduleAt('')}
 const save=()=>execute(async()=>{
  const v=validateCampaign(draft);if(!v.ok)throw new Error(v.error)
  const d=await post({action:'save',...(active?{id:active.id}:{}),campaign:v.value})
  setActive({...d.campaign,stats:active?.stats||{},audience_snapshot:null});setDraft(v.value);setDirty(false);setNotice('Rascunho salvo. Nenhum e-mail foi enviado.')
 })
 const preview=()=>execute(async()=>{setScheduleConfirmed(false);setAudience(null);const d=await post({action:'preview',filters:draft.filters});setAudience(d.audience)})
 const schedule=()=>execute(async()=>{
  if(!active||!audience||dirty||!scheduleConfirmed)throw new Error('Salve o rascunho, confira o público e confirme o conteúdo.')
  const at=scheduleAt?new Date(scheduleAt).toISOString():new Date().toISOString()
  const d=await post({action:'schedule',id:active.id,at,expected:audience.eligible,confirm:true})
  setActive({...d.campaign,stats:{total:audience.eligible,pending:audience.eligible}});setAudience(d.campaign.audience_snapshot);setNotice('Campanha agendada. Acompanhe os resultados abaixo.');await load(active.id)
 })
 const control=(action:'pause'|'resume'|'cancel')=>execute(async()=>{
  if(!active)return
  if(action==='resume'&&!window.confirm('Retomar poderá enviar os contatos ainda na fila. Confirmar?'))return
  if(action==='cancel'&&!window.confirm('Cancelar os contatos ainda na fila? E-mails já enviados ou em andamento não podem ser desfeitos.'))return
  await post({action,id:active.id});await load(active.id);setNotice(action==='pause'?'Campanha pausada. Um envio já em andamento pode terminar.':action==='cancel'?'Fila cancelada. Envios anteriores foram preservados.':'Campanha retomada.')
 })
 const permission=()=>execute(async()=>{
  if(!permissionConfirmed)throw new Error('Confirme que possui a permissão dos contatos selecionados.')
  if(!window.confirm(`Registrar permissão para ${audience?.exclusions.permission||0} endereços selecionados? Essa declaração ficará no histórico do admin. Quem pediu descadastro continua bloqueado.`))return
  const d=await post({action:'permission',filters:draft.filters,evidence,confirm:true});setNotice(`Permissão registrada para ${d.recorded} contatos. Nenhum e-mail foi enviado.`);setPermissionConfirmed(false)
  const p=await post({action:'preview',filters:draft.filters});setAudience(p.audience);setScheduleConfirmed(false)
 })
 const titleField=locale==='pt'?'subject_pt':'subject_es',bodyField=locale==='pt'?'body_pt':'body_es'
 const stats=active?.stats||{}
 return <div className="mx-auto max-w-6xl space-y-6 pb-12">
  <header className="flex flex-wrap items-center justify-between gap-4">
   <div><h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white"><Mail className="h-6 w-6 text-emerald-600"/>Campanhas de e-mail</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Seguro para a base Lead4Pro · controle exclusivo do admin</p></div>
   <button className={editing?secondary:primary} disabled={busy} onClick={()=>editing?(dirty&&!window.confirm('Sair sem salvar o rascunho?')?null:(setEditing(false),setActive(null),setError(''),void load(undefined,listPage))):newCampaign()}>{editing?<><ArrowLeft size={16}/>Campanhas</>:<><Plus size={16}/>Nova campanha</>}</button>
  </header>
  {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}<button className="ml-3 underline" onClick={()=>void load(active?.id,active?recipientPage:listPage)}>Tentar carregar novamente</button></div>}
  {notice&&<div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{notice}</div>}
  {config&&<div className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
   {config.ready?<CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600"/>:<AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600"/>}
   <div className="min-w-0 text-slate-600 dark:text-slate-300">{config.ready?<>Remetente: <strong className="break-all">{config.from}</strong> · até {config.dailyLimit} por dia, compartilhados entre campanhas</>:<><strong>Disparos bloqueados.</strong> {config.issues.join(' ')} Rascunhos e prévias continuam disponíveis.</>}</div>
  </div>}
  {!editing?<section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
   <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800"><h2 className="font-medium text-slate-900 dark:text-white">Suas campanhas <span className="ml-1 text-sm text-slate-400">{total}</span></h2><button aria-label="Atualizar campanhas" className={secondary} disabled={busy||loading} onClick={()=>void load(undefined,listPage)}><RefreshCw size={15}/></button></div>
   {loading?<p className="p-8 text-center text-sm text-slate-500">Carregando campanhas…</p>:campaigns.length===0?<div className="space-y-3 p-10 text-center"><Mail className="mx-auto h-8 w-8 text-slate-300"/><h3 className="font-medium text-slate-800 dark:text-slate-100">Sua primeira campanha começa aqui</h3><p className="text-sm text-slate-500">Escreva nos dois idiomas, confira o público e escolha quando enviar.</p><button onClick={newCampaign} className={primary}><Plus size={15}/>Criar campanha</button></div>:<div className="divide-y divide-slate-100 dark:divide-slate-800">{campaigns.map(c=><button key={c.id} disabled={busy} onClick={()=>void execute(async()=>{if(dirty&&!window.confirm('Descartar alterações não salvas?'))return;await load(c.id,0,true)})} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"><div><p className="font-medium text-slate-900 dark:text-slate-100">{c.name}</p><p className="mt-1 text-xs text-slate-500">{c.stats.total||0} destinatários · {c.stats.delivered||0} entregues{c.stats.unknown?` · ${c.stats.unknown} resultados incertos`:''}</p></div><Badge state={c.state}/></button>)}</div>}
   {total>50&&<div className="flex items-center justify-between border-t border-slate-100 p-4 dark:border-slate-800"><button className={secondary} disabled={!listPage||busy} onClick={()=>void load(undefined,listPage-1)}>Anterior</button><span className="text-sm text-slate-500">Página {listPage+1}</span><button className={secondary} disabled={(listPage+1)*50>=total||busy} onClick={()=>void load(undefined,listPage+1)}>Próxima</button></div>}
  </section>:<div className="space-y-5">
   <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-900 dark:text-white">{active?active.name:'Nova campanha'} {active&&<Badge state={active.state}/>}</h2><div className="flex flex-wrap gap-2">{active&&['scheduled','running'].includes(active.state)&&<button className={secondary} disabled={busy} onClick={()=>void control('pause')}><Pause size={15}/>Pausar</button>}{active?.state==='paused'&&<button className={secondary} disabled={busy||!config?.ready} onClick={()=>void control('resume')}><Play size={15}/>Retomar</button>}{active&&['draft','scheduled','running','paused'].includes(active.state)&&<button className={secondary} disabled={busy} onClick={()=>void control('cancel')}><Ban size={15}/>Cancelar campanha</button>}</div></div>
   <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
    <section className="min-w-0 space-y-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
     <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Nome da campanha<input aria-label="Nome da campanha" className={'mt-2 '+inputClass} value={draft.name} maxLength={100} disabled={!editable||busy} onChange={e=>change('name',e.target.value)} placeholder="Ex.: proteção da família — outubro"/></label>
     <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">{(['pt','es'] as const).map(l=><button key={l} aria-pressed={locale===l} onClick={()=>setLocale(l)} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${locale===l?'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white':'text-slate-500 dark:text-slate-400'}`}>{l==='pt'?'Português':'Español'}</button>)}</div>
     <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{locale==='pt'?'Assunto em português':'Asunto en español'}<input aria-label={locale==='pt'?'Assunto em português':'Asunto en español'} className={'mt-2 '+inputClass} value={draft[titleField]} maxLength={160} disabled={!editable||busy} onChange={e=>change(titleField,e.target.value)} placeholder={locale==='pt'?'Sua família merece proteção':'Tu familia merece protección'}/></label>
     <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{locale==='pt'?'Mensagem em português':'Mensaje en español'}<textarea aria-label={locale==='pt'?'Mensagem em português':'Mensaje en español'} className={'mt-2 min-h-56 resize-y '+inputClass} value={draft[bodyField]} maxLength={20000} disabled={!editable||busy} onChange={e=>change(bodyField,e.target.value)} placeholder={locale==='pt'?'Olá {{nome}},…':'Hola {{nome}},…'}/><span className="mt-2 block text-xs font-normal text-slate-500">Use {'{{nome}}'} para personalizar. Texto e links, sem HTML. Rodapé e descadastro são incluídos automaticamente.</span></label>
     <details className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><Eye size={16}/>Prévia do conteúdo<ChevronDown size={14} className="ml-auto"/></summary><div className="mt-4 space-y-4 break-words"><p className="font-semibold text-slate-800 dark:text-white">{draft[titleField].replace(/{{\s*nome\s*}}/g,'Maria')||'Assunto'}</p><p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">{draft[bodyField].replace(/{{\s*nome\s*}}/g,'Maria')||'Seu conteúdo aparecerá aqui.'}</p><p className="border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-slate-700">Lead4Pro · endereço postal configurado<br/>{locale==='pt'?'Cancelar recebimento':'Cancelar suscripción'}</p></div></details>
     {editable&&<div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">{dirty?'Alterações não salvas':active?'Rascunho salvo':'Nenhum disparo ao salvar'}</p><button className={primary} disabled={busy} onClick={()=>void save()}>{busy?'Aguarde…':'Salvar rascunho'}</button></div>}
    </section>
    <aside className="min-w-0 space-y-4">
     <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><div><h3 className="font-semibold text-slate-900 dark:text-white">Público</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">Toda a base, incluindo os leads dos clientes. Não altera o responsável pelo atendimento.</p></div>
      {editable&&<details><summary className="cursor-pointer text-sm font-medium text-emerald-700 dark:text-emerald-400">Filtrar público (opcional)</summary><div className="mt-3 space-y-3">
       <label className="block text-xs text-slate-500">Cliente<select aria-label="Cliente do público" className={'mt-1 '+inputClass} disabled={busy} value={draft.filters.buyer_id||''} onChange={e=>filter('buyer_id',e.target.value)}><option value="">Todos, incluindo leads sem dono</option>{buyers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
       <label className="block text-xs text-slate-500">Idioma<select aria-label="Idioma do público" className={'mt-1 '+inputClass} disabled={busy} value={draft.filters.languages?.[0]||''} onChange={e=>filter('languages',e.target.value?[e.target.value]:[])}><option value="">Português e espanhol</option><option value="pt">Português</option><option value="es">Español</option></select></label>
       <label className="block text-xs text-slate-500">Tipo<select aria-label="Tipo do público" className={'mt-1 '+inputClass} disabled={busy} value={draft.filters.types?.[0]||''} onChange={e=>filter('types',e.target.value?[e.target.value]:[])}><option value="">Quentes e frios</option><option value="hot">Quentes</option><option value="cold">Frios</option></select></label>
       <label className="block text-xs text-slate-500">Estados (siglas separadas por vírgula)<input aria-label="Estados do público" className={'mt-1 '+inputClass} disabled={busy} value={draft.filters.states?.join(',')||''} onChange={e=>filter('states',e.target.value.trim()?e.target.value.toUpperCase().split(',').map(v=>v.trim()):[])} placeholder="FL,NH,CA"/></label>
       <label className="block text-xs text-slate-500">Criados a partir de (UTC)<input aria-label="Início do período" className={'mt-1 '+inputClass} type="date" disabled={busy} value={draft.filters.since?.slice(0,10)||''} onChange={e=>filter('since',e.target.value?e.target.value+'T00:00:00Z':'')}/></label>
       <label className="block text-xs text-slate-500">Criados antes de (UTC)<input aria-label="Fim do período" className={'mt-1 '+inputClass} type="date" disabled={busy} value={draft.filters.until?.slice(0,10)||''} onChange={e=>filter('until',e.target.value?e.target.value+'T00:00:00Z':'')}/></label>
      </div></details>}
      {editable&&<button className={secondary+' w-full'} disabled={busy} onClick={()=>void preview()}><Eye size={15}/>Conferir público</button>}
      {audience&&<><div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950"><p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{audience.eligible}</p><p className="text-sm text-emerald-800 dark:text-emerald-200">endereços liberados · {audience.pt} PT / {audience.es} ES</p><p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">{audience.total_leads} cadastros considerados</p></div><dl className="space-y-2 text-xs">{Object.entries(audience.exclusions).filter(([,v])=>v>0).map(([key,value])=><div key={key} className="flex justify-between gap-3 text-slate-500 dark:text-slate-400"><dt>{exclusionLabels[key]||key}</dt><dd className="font-medium tabular-nums">{value}</dd></div>)}</dl></>}
     </section>
     {editable&&audience&&audience.exclusions.permission>0&&<details className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-white">Registrar permissão de contato</summary><div className="mt-4 space-y-3"><p className="text-xs leading-relaxed text-slate-500">Não presumimos autorização só porque o lead está no banco. Registre apenas uma permissão que você realmente possui para campanhas sobre seguro. Descadastros não são revertidos.</p><label className="block text-xs text-slate-500">Origem / referência da permissão<textarea aria-label="Origem da permissão" className={'mt-1 '+inputClass} maxLength={2000} value={evidence} disabled={busy} onChange={e=>setEvidence(e.target.value)} placeholder="Ex.: formulário, texto autorizado e período de coleta"/></label><label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300"><input className="mt-0.5" type="checkbox" checked={permissionConfirmed} disabled={busy} onChange={e=>setPermissionConfirmed(e.target.checked)}/>Confirmo que os {audience.exclusions.permission} contatos selecionados autorizaram essas campanhas. Esta declaração ficará registrada.</label><button className={secondary+' w-full'} disabled={busy||!permissionConfirmed||evidence.trim().length<10} onClick={()=>void permission()}>Registrar, sem enviar</button></div></details>}
     {editable&&<section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900"><h3 className="font-semibold text-slate-900 dark:text-white">Agendamento</h3><label className="block text-xs text-slate-500">Quando enviar (vazio = assim que possível)<input aria-label="Quando enviar" type="datetime-local" className={'mt-1 '+inputClass} disabled={busy} value={scheduleAt} onChange={e=>setScheduleAt(e.target.value)}/></label><p className="text-xs text-slate-400">Horário do seu navegador. O envio respeita o ritmo e o limite diário, não é instantâneo.</p><label className="flex items-start gap-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300"><input className="mt-0.5" type="checkbox" disabled={busy||dirty||!active||!audience?.eligible} checked={scheduleConfirmed} onChange={e=>setScheduleConfirmed(e.target.checked)}/>Conferi o conteúdo nos dois idiomas e o público de {audience?.eligible||0} endereços.</label><button className={primary+' w-full'} disabled={busy||!config?.ready||dirty||!active||!audience?.eligible||!scheduleConfirmed} onClick={()=>void schedule()}><Play size={15}/>Agendar campanha</button></section>}
    </aside>
   </div>
   {active&&active.state!=='draft'&&<section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center justify-between p-5"><h3 className="font-semibold text-slate-900 dark:text-white">Resultados</h3><button className={secondary} disabled={busy} onClick={()=>void load(active.id,recipientPage)}><RefreshCw size={15}/>Atualizar</button></div><div className="grid grid-cols-2 gap-4 px-5 pb-5 sm:grid-cols-4">{[['Na fila','pending'],['Aceitos pelo provedor','accepted'],['Entregues','delivered'],['Cliques','clicked'],['Aberturas estimadas','opened'],['Endereços recusados','bounced'],['Bloqueados','suppressed'],['Resultados incertos','unknown']].map(([label,key])=><div key={key}><p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{stats[key]||0}</p><p className="text-xs text-slate-500">{label}</p></div>)}</div><p className="px-5 pb-4 text-xs text-slate-500">Aceito pelo provedor não significa entregue. Cliques e aberturas dependem do rastreamento habilitado no domínio; aberturas podem ser infladas pela proteção de privacidade. Resultados incertos ficam parados, sem reenvio automático. Pausa e cancelamento não desfazem um envio em andamento.</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800"><tr><th className="px-5 py-3">Contato</th><th className="px-5 py-3">Idioma</th><th className="px-5 py-3">Resultado</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{recipients.map(r=><tr key={r.id}><td className="px-5 py-3"><p className="font-medium text-slate-800 dark:text-slate-100">{r.name}</p><p className="text-xs text-slate-500">{r.email}</p></td><td className="px-5 py-3 uppercase text-slate-500">{r.language}</td><td className="px-5 py-3"><Badge state={r.state}/></td></tr>)}</tbody></table></div><div className="flex items-center justify-between gap-2 p-4"><button className={secondary} disabled={busy||!recipientPage} onClick={()=>void load(active.id,recipientPage-1)}>Anterior</button><span className="text-xs text-slate-500">Página {recipientPage+1} · {recipientTotal} contatos</span><button className={secondary} disabled={busy||(recipientPage+1)*50>=recipientTotal} onClick={()=>void load(active.id,recipientPage+1)}>Próxima</button></div></section>}
  </div>}
 </div>
}
