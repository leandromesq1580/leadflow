'use client'

import {useEffect,useRef} from 'react'
import {campaignBodyFromEditor,renderCampaignEditor} from '@/lib/email-campaign-editor'

interface Props {value:string;language:'pt'|'es';label:string;disabled:boolean;onChange:(value:string)=>void}
export default function CampaignBodyEditor({value,language,label,disabled,onChange}:Props) {
  // Keep React's HTML prop identity stable. Otherwise each keystroke redraws the initial body.
  const root=useRef<HTMLDivElement>(null),canonical=useRef(value),initial=useRef({__html:renderCampaignEditor(value,language)})
  useEffect(()=>{
    if(root.current && value!==canonical.current){root.current.innerHTML=renderCampaignEditor(value,language);canonical.current=value}
  },[value,language])
  function update(){
    if(!root.current || disabled)return
    const next=campaignBodyFromEditor(root.current)
    if(next.length>20000){root.current.innerHTML=renderCampaignEditor(canonical.current,language);return}
    canonical.current=next;onChange(next)
  }
  return <div ref={root} role="textbox" aria-label={label} aria-multiline="true" aria-disabled={disabled} tabIndex={disabled?-1:0} contentEditable={!disabled} suppressContentEditableWarning
    className={'mt-1 min-h-40 w-full whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-emerald-900 '+(disabled?'opacity-60':'')}
    dangerouslySetInnerHTML={initial.current}
    onInput={update}
    onBlur={()=>{if(root.current)root.current.innerHTML=renderCampaignEditor(canonical.current,language)}}
    onClick={event=>{if((event.target as Element).closest('a'))event.preventDefault()}}
    onDrop={event=>event.preventDefault()}
    onPaste={event=>{
      event.preventDefault();if(disabled || !root.current)return
      const selection=window.getSelection();if(!selection?.rangeCount)return
      const range=selection.getRangeAt(0);if(!root.current.contains(range.commonAncestorContainer))return
      const pasted=event.clipboardData.getData('text/plain')
      if(canonical.current.length+pasted.length>20000)return
      range.deleteContents();const node=document.createTextNode(pasted);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);update()
    }}
    onCopy={event=>{
      const selection=window.getSelection();if(!selection?.rangeCount || !root.current)return
      const range=selection.getRangeAt(0);if(!root.current.contains(range.commonAncestorContainer))return
      event.clipboardData.setData('text/plain',campaignBodyFromEditor(range.cloneContents()));event.preventDefault()
    }}/>
}
