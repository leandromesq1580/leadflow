'use client'

import { useEffect, useState } from 'react'

export interface Stage { id: string; name: string; color: string; position: number }
export interface Pipeline { id: string; name: string; is_default: boolean; stages: Stage[] }

/** Carrega os pipelines do buyer 1x (pros pickers de estágio de Sequences/Automações).
 *  `defaultStages` = só a pipeline padrão (uso legado).
 *  `allStages` = TODAS, com o nome da pipeline junto — quem tem "Vendas" e "Pós Vendas"
 *  precisa automatizar as duas, e "Novo Lead" existe em quase todas (nome sozinho não basta). */
export function useStages(buyerId: string | null) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  useEffect(() => {
    if (!buyerId) return
    fetch(`/api/pipelines?buyer_id=${buyerId}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (d) setPipelines(d.pipelines || []) }).catch(() => {})
  }, [buyerId])
  const defaultStages = (pipelines.find(p => p.is_default) || pipelines[0])?.stages || []
  const ordenadas = [...pipelines].sort((a, b) => (a.is_default ? -1 : b.is_default ? 1 : 0))
  const allStages = ordenadas.flatMap(p =>
    [...(p.stages || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(s => ({ ...s, pipelineId: p.id, pipelineName: (p.name || 'Pipeline').trim() })))
  return { pipelines: ordenadas, defaultStages, allStages }
}
