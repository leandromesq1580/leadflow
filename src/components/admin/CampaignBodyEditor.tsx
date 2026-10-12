'use client'

import {useEffect,useRef,useState,type ClipboardEvent} from 'react'
import {campaignBodyFromEditor,renderCampaignEditor} from '@/lib/email-campaign-editor'

interface Props {value:string;language:'pt'|'es';label:string;disabled:boolean;onChange:(value:string)=>void}
export default function CampaignBodyEditor({value,language,label,disabled,onChange}:Props) {
  // Keep React's HTML prop identity stable. Otherwise each keystroke redraws the initial body.
  const root=useRef<HTMLDivElement>(null),canonical=useRef(value)
  const [initial]=useState(()=>({__html:renderCampaignEditor(value,language)}))
  const rememberedRange=useRef<Range|null>(null)
  useEffect(()=>{
    if(root.current && value!==canonical.current){root.current.innerHTML=renderCampaignEditor(value,language);canonical.current=value;rememberedRange.current=null}
  },[value,language])
  function update(){
    if(!root.current || disabled)return
    const next=campaignBodyFromEditor(root.current)
    if(next.length>20000){root.current.innerHTML=renderCampaignEditor(canonical.current,language);return}
    canonical.current=next;onChange(next)
  }
  function selectedRange(){
    const selection=window.getSelection();if(!selection?.rangeCount || !root.current)return null
    const range=selection.getRangeAt(0)
    return root.current.contains(range.commonAncestorContainer)?range:null
  }
  function copy(event:ClipboardEvent<HTMLDivElement>,cut=false){
    const range=selectedRange();if(!range || range.collapsed)return
    event.clipboardData.setData('text/plain',campaignBodyFromEditor(range.cloneContents()));event.preventDefault()
    // Native edit transactions preserve Ctrl+Z; Range mutations do not.
    if(cut && !disabled){document.execCommand('delete');update()}
  }
  return <div ref={root} role="textbox" aria-label={label} aria-multiline="true" aria-disabled={disabled} tabIndex={disabled?-1:0} contentEditable={!disabled} suppressContentEditableWarning
    className={'mt-1 min-h-40 w-full whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-emerald-900 '+(disabled?'opacity-60':'')}
    dangerouslySetInnerHTML={initial}
    onInput={update}
    onBlur={()=>{const range=selectedRange();if(range)rememberedRange.current=range.cloneRange()}}
    onFocus={()=>{
      const range=rememberedRange.current,selection=window.getSelection()
      if(range && selection && root.current?.contains(range.commonAncestorContainer)){selection.removeAllRanges();selection.addRange(range)}
    }}
    onClick={event=>{if((event.target as Element).closest('a'))event.preventDefault()}}
    onDrop={event=>event.preventDefault()}
    onPaste={event=>{
      event.preventDefault();if(disabled || !root.current)return
      const range=selectedRange();if(!range)return
      const pasted=event.clipboardData.getData('text/plain')
      const selected=campaignBodyFromEditor(range.cloneContents())
      if(canonical.current.length-selected.length+pasted.length>20000)return
      // This HTML is generated solely from escaped plain text, never clipboard HTML.
      document.execCommand('insertHTML',false,renderCampaignEditor(pasted,language));update()
    }}
    onCopy={event=>copy(event)} onCut={event=>copy(event,true)}/>
}
