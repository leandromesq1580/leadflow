'use client'

import {useEffect,useRef,useState,type ClipboardEvent} from 'react'
import {flushSync} from 'react-dom'
import {campaignBodyAfterInsertion,campaignBodyFromEditor,campaignHtmlFromEditor,renderCampaignEditor} from '@/lib/email-campaign-editor'
import {CAMPAIGN_BODY_LIMIT,campaignRichHtml,encodeCampaignHtml,escapeCampaignHtml,isRichCampaignBody,safeCampaignUrl,sanitizeCampaignHtml} from '@/lib/email-campaign-rich'

interface Props {value:string;language:'pt'|'es';label:string;disabled:boolean;onChange:(value:string)=>void;onUploadStateChange?:(busy:boolean)=>void}
type Panel='link'|'image'|'html'|null
const field='w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
export default function CampaignBodyEditor({value,language,label,disabled,onChange,onUploadStateChange}:Props) {
 const root=useRef<HTMLDivElement>(null),canonical=useRef(value),rich=useRef(isRichCampaignBody(value))
 const [initial]=useState(()=>({__html:renderCampaignEditor(value,language)}))
 const rememberedRange=useRef<Range|null>(null),uploadAbort=useRef<AbortController|null>(null)
 const [panel,setPanel]=useState<Panel>(null),[url,setUrl]=useState(''),[title,setTitle]=useState(''),[source,setSource]=useState(''),[error,setError]=useState(''),[uploading,setUploading]=useState(false)
 const unavailable=disabled||uploading
 useEffect(()=>()=>uploadAbort.current?.abort(),[])
 useEffect(()=>{
  if(root.current && value!==canonical.current){root.current.innerHTML=renderCampaignEditor(value,language);canonical.current=value;rich.current=isRichCampaignBody(value);rememberedRange.current=null}
 },[value,language])
 function update(forceRich=false){
  if(!root.current)return false
  const next=forceRich||rich.current?campaignHtmlFromEditor(root.current):campaignBodyFromEditor(root.current)
  if(next.length>CAMPAIGN_BODY_LIMIT){root.current.innerHTML=renderCampaignEditor(canonical.current,language);setError('A mensagem pode ter até 20.000 caracteres, incluindo o HTML.');return false}
  rich.current=isRichCampaignBody(next);canonical.current=next;onChange(next);return true
 }
 function selectedRange(){
  const selection=window.getSelection();if(!selection?.rangeCount || !root.current)return null
  const range=selection.getRangeAt(0)
  return root.current.contains(range.commonAncestorContainer)?range:null
 }
 function remember(){const range=selectedRange();if(range)rememberedRange.current=range.cloneRange()}
 function restore(){
  const element=root.current,selection=window.getSelection();if(!element||!selection)return
  element.focus();const range=rememberedRange.current
  if(range&&element.contains(range.commonAncestorContainer)){selection.removeAllRanges();selection.addRange(range)}
  else{const end=document.createRange();end.selectNodeContents(element);end.collapse(false);selection.removeAllRanges();selection.addRange(end)}
 }
 function close(){setPanel(null);setError('');restore()}
 function open(next:Panel){
  if(unavailable)return
  remember();setError('');setUrl('');setTitle('');setSource('')
  if(next==='link')setTitle(window.getSelection()?.toString()||'')
  if(next==='html')setSource(renderCampaignEditor(canonical.current,language).replaceAll(' contenteditable="false"',''))
  setPanel(next)
 }
 function format(command:string){if(unavailable)return;remember();restore();document.execCommand('styleWithCSS',false,'false');document.execCommand(command);update(true);remember()}
 function insert(html:string,replaceAll=false){
  restore()
  if(replaceAll){const range=document.createRange();range.selectNodeContents(root.current!);const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range)}
  document.execCommand('insertHTML',false,sanitizeCampaignHtml(html).replaceAll('<a ','<a contenteditable="false" '))
  if(update(true)){setPanel(null);setError('');remember()}
 }
 function apply(){
  if(unavailable)return
  const destination=safeCampaignUrl(url.trim(),panel==='image')
  if(panel==='html'){
   const body=encodeCampaignHtml(source)
   if(body.length>CAMPAIGN_BODY_LIMIT){setError('O HTML ultrapassa 20.000 caracteres.');return}
   insert(campaignRichHtml(body),true);return
  }
  if(!destination){setError(panel==='image'?'Use uma URL HTTPS válida para a imagem.':'Use um link HTTP ou HTTPS válido.');return}
  if(!title.trim()){setError(panel==='image'?'Descreva a imagem para quem não puder vê-la.':'Informe o texto que aparecerá no link.');return}
  const link=`<a href="${escapeCampaignHtml(destination)}">${escapeCampaignHtml(title.trim())}</a>`
  insert(panel==='image'?`<img src="${escapeCampaignHtml(destination)}" alt="${escapeCampaignHtml(title.trim())}">`:rememberedRange.current?.collapsed?` ${link} `:link)
 }
 async function upload(file:File){
  if(unavailable)return
  if(file.size>3*1024*1024||!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)){setError('Use JPG, PNG, WEBP ou GIF de até 3 MB.');return}
  if(!title.trim()){setError('Descreva a imagem antes de escolher o arquivo.');return}
  setError('');setUploading(true);onUploadStateChange?.(true)
  const controller=new AbortController();uploadAbort.current=controller
  try{
   const form=new FormData();form.set('image',file)
   const response=await fetch('/api/admin/email-campaigns/images',{method:'POST',body:form,signal:controller.signal});const data=await response.json()
   if(!response.ok)throw new Error(data.error||'Não foi possível carregar a imagem.')
   const destination=safeCampaignUrl(data.url??'',true)
   if(!destination)throw new Error('A imagem não retornou um endereço seguro.')
   if(root.current&&!controller.signal.aborted){
    // Native insertion requires the editable DOM to be unlocked, not just queued state.
    flushSync(()=>{setUploading(false);onUploadStateChange?.(false)})
    insert(`<img src="${escapeCampaignHtml(destination)}" alt="${escapeCampaignHtml(title.trim())}">`)
   }
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível carregar a imagem.')}
  finally{uploadAbort.current=null;setUploading(false);onUploadStateChange?.(false)}
 }
 function copy(event:ClipboardEvent<HTMLDivElement>,cut=false){
  const range=selectedRange();if(!range || range.collapsed)return
  if(rich.current){const fragment=document.createElement('div');fragment.append(range.cloneContents());const body=campaignHtmlFromEditor(fragment);event.clipboardData.setData('application/x-lead4pro-campaign',body);event.clipboardData.setData('text/html',campaignRichHtml(body));event.clipboardData.setData('text/plain',campaignBodyFromEditor(fragment))}
  else event.clipboardData.setData('text/plain',campaignBodyFromEditor(range.cloneContents()))
  event.preventDefault();if(cut&&!unavailable){document.execCommand('delete');update()}
 }
 return <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
  <div role="toolbar" aria-label="Formatação da mensagem" className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800">
   {([['Negrito','B',()=>format('bold')],['Itálico','I',()=>format('italic')],['Inserir link','Link',()=>open('link')],['Adicionar imagem','Imagem',()=>open('image')],['Editar HTML','</>',()=>open('html')]] as const).map(([name,text,action])=><button key={name} type="button" aria-label={name} title={name} disabled={unavailable} onMouseDown={e=>e.preventDefault()} onClick={action} className={'rounded px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-slate-700 '+(name==='Negrito'?'font-bold':name==='Itálico'?'italic':'font-medium')}>{text}</button>)}
  </div>
  {panel&&<div role="dialog" aria-label={panel==='html'?'Editar HTML':panel==='link'?'Inserir link':'Adicionar imagem'} className="space-y-3 border-b border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800" onKeyDown={e=>{if(e.key==='Escape'&&!uploading){e.preventDefault();close()}}}>
   {panel==='html'?<><label className="block text-xs">HTML da mensagem<textarea autoFocus aria-label="HTML da mensagem" value={source} disabled={unavailable} maxLength={CAMPAIGN_BODY_LIMIT} onChange={e=>setSource(e.target.value)} className={field+' mt-1 min-h-40 font-mono'}/></label><p className="text-xs font-normal text-slate-500">Negrito, parágrafos, listas, links e imagens HTTPS. Scripts e estilos inseguros são removidos.</p></>:<>
    <label className="block text-xs">{panel==='link'?'Texto do link':'Descrição da imagem'}<input autoFocus aria-label={panel==='link'?'Texto do link':'Descrição da imagem'} value={title} maxLength={300} disabled={unavailable} onChange={e=>setTitle(e.target.value)} className={field+' mt-1'}/></label>
    <label className="block text-xs">{panel==='link'?'Endereço do link':'URL da imagem (HTTPS)'}<input aria-label={panel==='link'?'Endereço do link':'URL da imagem (HTTPS)'} type="url" value={url} maxLength={4096} disabled={unavailable} onChange={e=>setUrl(e.target.value)} className={field+' mt-1'} placeholder="https://"/></label>
    {panel==='image'&&<label className="block text-xs">Ou envie do computador<input aria-label="Arquivo de imagem" type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={unavailable} className="mt-1 block w-full text-xs font-normal text-slate-500" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value=''}}/><span className="mt-1 block font-normal text-slate-500">JPG, PNG, WEBP ou GIF · até 3 MB. A imagem será pública para aparecer no e-mail; não use dados privados de clientes.</span></label>}
   </>}
   <div className="flex gap-2"><button type="button" disabled={unavailable} onClick={apply} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:opacity-40">{panel==='html'?'Aplicar HTML':panel==='link'?'Inserir link':'Inserir por URL'}</button><button type="button" disabled={uploading} onClick={close} className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300">Cancelar</button></div>
  </div>}
  {error&&<p role="alert" className="px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
  {uploading&&<p role="status" className="px-3 py-2 text-xs text-slate-500">Carregando imagem…</p>}
  <div ref={root} role="textbox" aria-label={label} aria-multiline="true" aria-disabled={unavailable} tabIndex={unavailable?-1:0} contentEditable={!unavailable} suppressContentEditableWarning
   className={'min-h-40 w-full whitespace-pre-wrap break-words bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-200 dark:bg-slate-900 dark:text-white dark:focus:ring-emerald-900 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-lg [&_h3]:text-base '+(unavailable?'opacity-60':'')}
   dangerouslySetInnerHTML={initial} onInput={()=>{if(!unavailable)update()}} onBlur={remember}
   onKeyDown={event=>{if(!unavailable&&(event.ctrlKey||event.metaKey)&&!event.altKey&&['b','i','k'].includes(event.key.toLowerCase())){event.preventDefault();if(event.key.toLowerCase()==='k')open('link');else format(event.key.toLowerCase()==='b'?'bold':'italic')}}}
   onFocus={()=>{const range=rememberedRange.current,selection=window.getSelection();if(range&&selection&&root.current?.contains(range.commonAncestorContainer)){selection.removeAllRanges();selection.addRange(range)}}}
   onClick={event=>{if((event.target as Element).closest('a'))event.preventDefault()}} onDrop={event=>event.preventDefault()}
   onPaste={event=>{
    event.preventDefault();if(unavailable||!root.current)return;const range=selectedRange();if(!range)return
    const internal=event.clipboardData.getData('application/x-lead4pro-campaign'),hasRich=isRichCampaignBody(internal)
    const pasted=event.clipboardData.getData('text/plain')
    if((hasRich?internal.length:pasted.length)>CAMPAIGN_BODY_LIMIT){setError('A mensagem pode ter até 20.000 caracteres, incluindo o HTML.');return}
    const html=hasRich?renderCampaignEditor(internal,language):renderCampaignEditor(pasted,language)
    if(campaignBodyAfterInsertion(root.current,range,html,rich.current||hasRich).length>CAMPAIGN_BODY_LIMIT){setError('A mensagem pode ter até 20.000 caracteres, incluindo o HTML.');return}
    document.execCommand('insertHTML',false,html);update(hasRich);setError('')
   }}
   onCopy={event=>copy(event)} onCut={event=>copy(event,true)}/>
 </div>
}
