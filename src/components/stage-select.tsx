'use client'

/**
 * SELETOR DE ESTÁGIO — todas as pipelines, agrupadas.
 *
 * Quem tem mais de um funil ("Vendas" e "Pós Vendas") só conseguia automatizar a
 * pipeline padrão: as telas achatavam só ela e o resto ficava inalcançável, apesar
 * de o motor de automação já disparar em qualquer pipeline.
 *
 * Como nome de estágio se repete muito entre funis ("Novo Lead" existe em quase
 * todos), listar tudo junto seria pior que o bug: aqui os estágios vêm agrupados
 * pelo nome da pipeline. Com um funil só, a lista fica plana como sempre foi.
 */

export interface StageOpt { id: string; name: string; position?: number }
export interface PipelineOpt { id: string; name: string; is_default?: boolean; stages?: StageOpt[] }

/** Pipeline padrão primeiro; estágios na ordem do funil. */
export function ordenarPipelines(pipelines: PipelineOpt[]): PipelineOpt[] {
  return [...(pipelines || [])]
    .sort((a, b) => (a.is_default ? -1 : b.is_default ? 1 : 0))
    .map(p => ({
      ...p,
      name: (p.name || 'Pipeline').trim(),
      stages: [...(p.stages || [])]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map(s => ({ ...s, name: (s.name || '').trim() })),
    }))
}

/** Lista achatada de todos os estágios, carregando de qual pipeline cada um veio. */
export function todosOsEstagios(pipelines: PipelineOpt[]) {
  return ordenarPipelines(pipelines).flatMap(p =>
    (p.stages || []).map(s => ({ ...s, pipelineId: p.id, pipelineName: p.name })))
}

/** Como escrever o estágio na tela: com vários funis, o nome sozinho é ambíguo. */
export function rotuloDoEstagio(pipelines: PipelineOpt[], stageId?: string, vazio = '—'): string {
  if (!stageId) return vazio
  const achado = todosOsEstagios(pipelines).find(s => s.id === stageId)
  if (!achado) return vazio
  return (pipelines || []).length > 1 ? `${achado.pipelineName} · ${achado.name}` : achado.name
}

export function StageSelect({ pipelines, value, onChange, placeholder, className, style }: {
  pipelines: PipelineOpt[]
  value: string
  onChange: (id: string) => void
  placeholder: string
  className?: string
  style?: React.CSSProperties
}) {
  const lista = ordenarPipelines(pipelines).filter(p => (p.stages || []).length > 0)
  const agrupar = lista.length > 1

  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={className} style={style}>
      <option value="">{placeholder}</option>
      {agrupar
        ? lista.map(p => (
            <optgroup key={p.id} label={p.name}>
              {(p.stages || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          ))
        : (lista[0]?.stages || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  )
}
