'use client'

import { useEffect, useRef, useState } from 'react'
import { resolveActionEdit, safePipelineReturn } from './pipeline-action-links'

export function useActionEditLink<T extends {id: string}>(items: T[], ready: boolean, onEdit: (item: T) => void) {
  const handled = useRef(false)
  const open = useRef(onEdit)
  useEffect(()=>{open.current=onEdit},[onEdit])
  const [returnTo,setReturnTo] = useState<string | null>(null)
  const [missing,setMissing] = useState(false)
  useEffect(()=>{
    if (!ready || handled.current) return
    handled.current=true
    const params = new URLSearchParams(window.location.search)
    if (!params.has('edit')) return
    // Hydrate the external URL only after the authenticated list has loaded.
    const safeReturn = safePipelineReturn(params.get('returnTo'))
    // A native editor must stay inside /m even when the return parameter is absent/forged.
    const returnPath = window.location.pathname.startsWith('/m/') ? safeReturn.replace(/^\/dashboard\/pipeline/, '/m/pipeline') : safeReturn
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReturnTo(returnPath)
    const item = resolveActionEdit(window.location.search,items)
    if(item) open.current(item)
    else setMissing(true)
  },[items,ready])
  return {returnTo,missing}
}
