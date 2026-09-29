/** Shared allowlist: the selected ID is used unchanged by preview and dispatch. */
export const AI_SEQUENCE_MODELS = [
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', description: 'Padrão para novas sequências; modelo atual de uso geral.' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', description: 'Modelo de maior capacidade; custo mais alto.' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', description: 'Modelo atual eficiente para tarefas curtas e repetidas.' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini (legado)', description: 'Preserva o modelo das sequências antigas sem seleção explícita.' },
] as const
export type AISequenceModel = typeof AI_SEQUENCE_MODELS[number]['id']
export const DEFAULT_AI_SEQUENCE_MODEL: AISequenceModel = 'gpt-6.1-sol'
export const LEGACY_AI_SEQUENCE_MODEL: AISequenceModel = 'gpt-4o-mini'
