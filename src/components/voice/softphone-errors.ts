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

/**
 * Ligação que tocou e ninguém atendeu: o Twilio encerra a perna do navegador com o erro genérico 31000.
 * Não é falha do telefone — o resultado "não atendeu" já chega pelos callbacks de status.
 * Só vale se a chamada chegou a tocar e nunca foi atendida; sem tocar, 31000 continua sendo falha.
 */
export function isUnansweredRingOut(failure: { code: number | null; reason?: string }, state: { ringing: boolean; accepted: boolean }): boolean {
  return failure.code === 31000 && state.ringing && !state.accepted
}
