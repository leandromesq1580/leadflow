'use client'

import { useCallback, useEffect, useState } from 'react'
export type StageAction = {id: string; name: string; enabled: boolean}
export type StageActions = {id: string; sequences: StageAction[]; automations: StageAction[]}
export type StageActionsState = {status: 'loading' | 'error' | 'restricted' | 'not-applicable' | 'unavailable'; pipelineId: string | null} | {status:'ready';pipelineId:string;stages:StageActions[]}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function useStageActions(pipelineId: string | null) {
  const applicable = !!pipelineId && uuid.test(pipelineId)
  // The team API returns this virtual board when the member has no own pipeline.
  const pseudo = !!pipelineId?.startsWith('pseudo-pipe-') && uuid.test(pipelineId.slice('pseudo-pipe-'.length))
  const [state,setState] = useState<StageActionsState>({status:'loading',pipelineId:null})
  const [revision,setRevision] = useState(0)
  const retry = useCallback(()=>{if (applicable) setRevision(n=>n+1)},[applicable])
  useEffect(()=>{
    if (!applicable || !pipelineId) return
    let active = true
    const controller = new AbortController()
    // Reset even same-pipeline retries: stale counts must not look current during refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({status:'loading',pipelineId})
    fetch(`/api/pipeline/stage-actions?${new URLSearchParams({pipeline_id:pipelineId})}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
      if (!active) return
      if (response.status===401 || response.status===403) {setState({status:'restricted',pipelineId});return}
      if (!response.ok) throw new Error('Read failed')
      const data = await response.json()
      if (data.pipeline_id!==pipelineId || !Array.isArray(data.stages)) throw new Error('Invalid response')
      if(active) setState({status:'ready',pipelineId,stages:data.stages})
    }).catch(()=>{if(active) setState({status:'error',pipelineId})})
    return ()=>{active=false;controller.abort()}
  },[pipelineId,revision,applicable])
  useEffect(()=>{
    if (!applicable) return
    window.addEventListener('focus',retry)
    return ()=>window.removeEventListener('focus',retry)
  },[retry,applicable])
  if (!applicable) return {state:{status:pseudo?'not-applicable':pipelineId?'unavailable':'loading',pipelineId} as StageActionsState,retry}
  return {state:state.pipelineId===pipelineId?state:{status:'loading',pipelineId} as StageActionsState,retry}
}
