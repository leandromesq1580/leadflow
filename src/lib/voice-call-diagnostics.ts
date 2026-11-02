/**
 * Diagnóstico de ligação que não completou: guarda o código SIP/erro que o Twilio manda no callback
 * de status (ex.: 480 = telefone do lead indisponível, 486 = ocupado). Antes só ficava "failed" sem causa.
 */
function intIn(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'string' && /^\d{1,6}$/.test(v) ? parseInt(v, 10) : null
  return n !== null && n >= min && n <= max ? n : null
}

export function extractCallDiagnostics(p: Record<string, string>): { sip_response_code: number | null; error_code: number | null } {
  return {
    sip_response_code: intIn(p.SipResponseCode ?? p.DialSipResponseCode, 100, 699),
    error_code: intIn(p.ErrorCode, 10000, 99999),
  }
}
