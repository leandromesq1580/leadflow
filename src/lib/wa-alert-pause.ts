/**
 * Pausa dos avisos "WhatsApp de <cliente> DESCONECTOU / reconectou" enviados aos admins.
 * Guardada em settings.key = 'wa_disconnect_alert_pause' com { until: ISO }. Expira sozinha.
 * Só silencia o aviso por cliente; o monitoramento e o status no banco continuam, e o
 * watchdog da bridge global de avisos (piroli) não passa por aqui.
 */
export const WA_DISCONNECT_ALERT_PAUSE_KEY = 'wa_disconnect_alert_pause'

export function isWaDisconnectAlertPaused(value: unknown, now: Date = new Date()): boolean {
  if (!value || typeof value !== 'object') return false
  const until = (value as { until?: unknown }).until
  if (typeof until !== 'string') return false
  const t = Date.parse(until)
  return Number.isFinite(t) && t > now.getTime()
}
