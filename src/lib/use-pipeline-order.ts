'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PipelineOrder, ConversationDates } from './pipeline-ordering'
const endpoint='/api/pipeline/conversation-order'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const storageKey=(id:string)=>'l4p:pipeline-order:v1:'+id
export type OrderStatus='idle'|'loading'|'ready'|'refreshing'|'error'|'restricted'
type Identity={id:string|null;status:'loading'|'ready'|'error'|'restricted'}
type Metadata={key:string;status:OrderStatus;dates:ConversationDates}

/** Session identity is verified server-side, never inferred from a board/team owner or decoded cookie. */
export function usePipelineOrder(pipelineId: string | null) {
  const [identity,setIdentity]=useState<Identity>({id:null,status:'loading'})
  const [preference,setPreference]=useState<{id:string|null;value:PipelineOrder}>({id:null,value:'newest'})
  const [metadata,setMetadata]=useState<Metadata>({key:'',status:'idle',dates:{}})
  const [revision,setRevision]=useState(0)
  const validating=useRef<(()=>void)|null>(null)
  const currentIdentity=useRef<string|null>(null)
  const flight=useRef<object|null>(null)
  const lastRetry=useRef(0)
  const mode=identity.id&&preference.id===identity.id?preference.value:'newest'
  const key=identity.id&&pipelineId?`${identity.id}/${pipelineId}`:''
  const applicable=!!pipelineId&&uuid.test(pipelineId)

  useEffect(()=>{
    let active=true,inFlight=false,last=0,generation=0
    let controller:AbortController|null=null
    let timeout:ReturnType<typeof setTimeout>|null=null
    const validate=async(force=false)=>{
      if(!force && (inFlight || Date.now()-last<2000))return
      const request=++generation
      controller?.abort()
      if(timeout)clearTimeout(timeout)
      inFlight=true;last=Date.now();controller=new AbortController()
      currentIdentity.current=null
      setIdentity({id:null,status:'loading'})
      timeout=setTimeout(()=>{
        if(!active||request!==generation)return
        generation++;inFlight=false;controller?.abort()
        setIdentity({id:null,status:'error'})
      },15000)
      try {
        const response=await fetch(endpoint,{cache:'no-store',signal:controller.signal})
        if(!active || request!==generation)return
        if(response.status===401||response.status===403){setIdentity({id:null,status:'restricted'});return}
        if(!response.ok)throw Error('Identity unavailable')
        const data=await response.json()
        if(!active || request!==generation)return
        if(typeof data.auth_user_id!=='string'||!uuid.test(data.auth_user_id))throw Error('Invalid identity')
        const id=data.auth_user_id
        let value:PipelineOrder='newest'
        let readable=true
        try {if(window.localStorage.getItem(storageKey(id))==='conversation')value='conversation'} catch { readable=false }
        currentIdentity.current=id
        setPreference(previous=>({id,value:!readable&&previous.id===id?previous.value:value}))
        setIdentity({id,status:'ready'})
        setRevision(n=>n+1)
      } catch {if(active&&request===generation)setIdentity({id:null,status:'error'})}
      finally {if(request===generation){inFlight=false;if(timeout)clearTimeout(timeout)}}
    }
    validating.current=validate
    // Same-origin storage changes can signal a different login in another tab.
    const focus=()=>{void validate()}
    const storage=(event?:StorageEvent)=>{
      if(!event?.key || event.key.startsWith('sb-') || event.key.startsWith('l4p:pipeline-order:'))void validate(true)
    }
    const visible=()=>{if(document.visibilityState==='visible')void validate()}
    void validate()
    window.addEventListener('focus',focus)
    window.addEventListener('storage',storage)
    document.addEventListener('visibilitychange',visible)
    return ()=>{active=false;controller?.abort();if(timeout)clearTimeout(timeout);validating.current=null;window.removeEventListener('focus',focus);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',visible)}
  },[])

  const setMode=useCallback((value:PipelineOrder)=>{
    if(value!=='newest'&&value!=='conversation')return
    const id=currentIdentity.current
    if(!id || id!==identity.id)return
    setPreference({id,value})
    // Do not persist in an effect: initial SSR/defaults must never overwrite another account.
    try {window.localStorage.setItem(storageKey(id),value)} catch { /* choice still works in memory */ }
  },[identity.id])
  const retry=useCallback(()=>{
    if(flight.current || Date.now()-lastRetry.current<2000)return
    lastRetry.current=Date.now()
    if(!identity.id){validating.current?.();return}
    if(mode==='conversation'&&applicable)setRevision(n=>n+1)
  },[identity.id,mode,applicable])

  useEffect(()=>{
    if(mode!=='conversation'||!identity.id||!pipelineId||!applicable)return
    let active=true
    const token={};flight.current=token
    const controller=new AbortController()
    const timeout=setTimeout(()=>{
      active=false;controller.abort()
      if(flight.current===token)flight.current=null
      setMetadata({key,status:'error',dates:{}})
    },15000)
    // Keep previously verified ordering while refreshing this same identity/board.
    setMetadata(old=>({key,status:old.key===key&&['ready','refreshing'].includes(old.status)?'refreshing':'loading',dates:old.key===key?old.dates:{}}))
    fetch(`${endpoint}?${new URLSearchParams({pipeline_id:pipelineId})}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!active)return
      if(response.status===401||response.status===403){setMetadata({key,status:'restricted',dates:{}});return}
      if(!response.ok)throw Error('Unavailable')
      const data=await response.json()
      if(!active)return
      if(data.auth_user_id!==identity.id){currentIdentity.current=null;setIdentity({id:null,status:'error'});throw Error('Identity changed')}
      if(data.pipeline_id!==pipelineId||!Array.isArray(data.conversations))throw Error('Invalid response')
      const dates:ConversationDates={}
      for(const item of data.conversations){
        if(typeof item.lead_id!=='string'||(item.last_whatsapp_at!==null&&(typeof item.last_whatsapp_at!=='string'||!Number.isFinite(Date.parse(item.last_whatsapp_at)))))throw Error('Invalid date')
        dates[item.lead_id]=item.last_whatsapp_at
      }
      setMetadata({key,status:'ready',dates})
    }).catch(()=>{if(active)setMetadata({key,status:'error',dates:{}})}).finally(()=>{clearTimeout(timeout);if(flight.current===token)flight.current=null})
    return ()=>{active=false;clearTimeout(timeout);controller.abort();if(flight.current===token)flight.current=null}
  },[pipelineId,identity.id,key,mode,revision,applicable])

  useEffect(()=>{
    if(mode!=='conversation'||!applicable||!identity.id)return
    // Short fallback through the owner-authorized API (no broader message subscription).
    // Only ready reads poll: in-flight/error/restricted never cause retry loops.
    if(metadata.status!=='ready')return
    const timer=setInterval(()=>{if(document.visibilityState==='visible')retry()},5000)
    return ()=>clearInterval(timer)
  },[mode,applicable,identity.id,metadata.status,retry])

  let status:OrderStatus=mode==='newest'?'idle':!applicable?'restricted':metadata.key===key?metadata.status:'loading'
  if(identity.status==='error'||identity.status==='restricted')status=identity.status
  const usable=mode==='conversation'&&metadata.key===key&&(status==='ready'||status==='refreshing')
  return {mode,setMode,status,dates:usable?metadata.dates:{},effectiveMode:usable?'conversation' as const:'newest' as const,retry,identityReady:identity.status==='ready'}
}
