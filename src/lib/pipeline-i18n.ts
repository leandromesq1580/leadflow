import type { Locale } from './i18n'

type StageLike = { name: string; position?: number | null }
type PipelineLike = { name: string; is_default?: boolean | null; stages?: StageLike[] | null }

const STAGES = {
  new_lead: { pt: 'Novo lead', en: 'New lead', es: 'Nuevo prospecto' },
  contacted: { pt: 'Atendido', en: 'Contacted', es: 'Contactado' },
  qualified: { pt: 'Qualificado', en: 'Qualified', es: 'Calificado' },
  proposal: { pt: 'Proposta enviada', en: 'Proposal sent', es: 'Propuesta enviada' },
  negotiation: { pt: 'Negociação', en: 'Negotiation', es: 'Negociación' },
  won: { pt: 'Fechado/Ganho', en: 'Closed/Won', es: 'Cerrado/Ganado' },
  lost: { pt: 'Perdido', en: 'Lost', es: 'Perdido' },
} as const

type StageKey = keyof typeof STAGES

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

const STAGE_KEYS = Object.entries(STAGES).reduce<Record<string, StageKey>>((out, [key, names]) => {
  for (const name of Object.values(names)) out[normalize(name)] = key as StageKey
  return out
}, {
  'novo lead': 'new_lead',
  'envio proposta': 'proposal',
})

export function localizeStageName(name: string, locale: Locale): string {
  const key = STAGE_KEYS[normalize(name)]
  return key ? STAGES[key][locale] : name
}

/**
 * So considera um conjunto de etapas como padrao quando ele conserva pelo
 * menos cinco das sete etapas geradas pelo sistema. Etapas personalizadas do
 * cliente ficam intactas, mesmo dentro do mesmo funil.
 */
export function localizePipeline<T extends PipelineLike>(pipeline: T, locale: Locale): T {
  const stages = pipeline.stages || []
  const systemStageCount = stages.filter(stage => STAGE_KEYS[normalize(stage.name)]).length
  if (systemStageCount < 5) return pipeline

  const nameKey = normalize(pipeline.name)
  const name = ['vendas', 'sales', 'ventas', 'funil de vendas', 'sales pipeline', 'flujo de ventas'].includes(nameKey)
    ? (locale === 'en' ? 'Sales pipeline' : locale === 'es' ? 'Flujo de ventas' : 'Funil de vendas')
    : pipeline.name

  return {
    ...pipeline,
    name,
    stages: stages.map(stage => ({ ...stage, name: localizeStageName(stage.name, locale) })),
  }
}

export function localizePipelines<T extends PipelineLike>(pipelines: T[], locale: Locale): T[] {
  return pipelines.map(pipeline => localizePipeline(pipeline, locale))
}
