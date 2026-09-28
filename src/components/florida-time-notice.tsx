import { FLORIDA_TIME_ZONE } from '@/lib/florida-time'

/** Shared by desktop, admin and mobile, without depending on a client context. */
export function FloridaTimeNotice({ locale = 'pt' }: { locale?: string }) {
  const label = locale === 'en'
    ? 'System timestamps: Florida (East Coast)'
    : locale === 'es' ? 'Horarios del sistema: Florida (costa este)' : 'Horários do sistema: Flórida (costa leste)'
  const detail = locale === 'en'
    ? 'EST/EDT · daylight saving adjusted automatically'
    : locale === 'es' ? 'EST/EDT · horario de verano automático' : 'EST/EDT · horário de verão automático'
  return <p data-system-timezone={FLORIDA_TIME_ZONE} className="text-xs mb-4" style={{ padding: '8px 12px', color: 'inherit', opacity: 0.8 }}>
    {label} · {FLORIDA_TIME_ZONE} · {detail}
  </p>
}
