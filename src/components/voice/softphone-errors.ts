export type CallFailureReason = 'microphone_permission' | 'authentication' | 'connection' | 'unknown'

/** Retorna só categoria e código numérico; nunca encaminha mensagem/token do SDK à tela. */
export function classifyCallFailure(error: unknown): { reason: CallFailureReason; code: number | null } {
  const e = error && typeof error === 'object' ? error as { code?: unknown; name?: unknown } : {}
  const code = typeof e.code === 'number' && Number.isInteger(e.code) && e.code >= 10000 && e.code <= 99999 ? e.code : null
  if (code === 31401 || (code === null && e.name === 'NotAllowedError')) return { reason: 'microphone_permission', code }
  if (code !== null && [20101, 20104, 20151, 31202, 31204, 31205, 31207, 31102].includes(code)) return { reason: 'authentication', code }
  if (code !== null && [31003, 31005, 31009, 53000, 53001, 53405].includes(code)) return { reason: 'connection', code }
  return { reason: 'unknown', code }
}
