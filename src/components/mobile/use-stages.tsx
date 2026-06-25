'use client'

import { useEffect, useState } from 'react'

export interface Stage { id: string; name: string; color: string; position: number }
export interface Pipeline { id: string; name: string; is_default: boolean; stages: Stage[] }

/** Carrega os pipelines do buyer 1x (pros pickers de estágio de Sequences/Automações). */
export function useStages(buyerId: string | null) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  useEffect(() => {
    if (!buyerId) return
    fetch(`/api/pipelines?buyer_id=${buyerId}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (d) setPipelines(d.pipelines || []) }).catch(() => {})
  }, [buyerId])
  const defaultStages = (pipelines.find(p => p.is_default) || pipelines[0])?.stages || []
  return { pipelines, defaultStages }
}
