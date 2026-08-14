'use client'

import { usePrivacy } from '@/lib/privacy-mode'
import { useT } from '@/lib/i18n-client'

export function PrivacyToggle() {
  const { enabled, toggle } = usePrivacy()
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  return (
    <button
      onClick={toggle}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-bold transition-colors"
      style={{
        background: enabled ? '#0f172a' : 'var(--bg-soft)',
        color: enabled ? '#fff' : 'var(--fg-secondary)',
        border: `1px solid ${enabled ? '#0f172a' : 'var(--border)'}`,
      }}
      title={enabled
        ? L('Modo apresentação ATIVO (telefones/emails ocultos)', 'Presentation mode ON (phones/emails hidden)', 'Modo presentación ACTIVO (teléfonos/emails ocultos)')
        : L('Ativar modo apresentação', 'Enable presentation mode', 'Activar modo presentación')}
    >
      <span className="text-[14px]" aria-hidden>{enabled ? '🙈' : '👁️'}</span>
      <span className="flex-1 text-left">{enabled
        ? L('Apresentação ON', 'Presentation ON', 'Presentación ON')
        : L('Apresentação', 'Presentation', 'Presentación')}</span>
      <span
        className="w-7 h-4 rounded-full relative"
        style={{ background: enabled ? '#10b981' : '#cbd5e1' }}
      >
        <span
          className="absolute w-3 h-3 bg-white rounded-full top-0.5 shadow"
          style={{ left: enabled ? '14px' : '2px', transition: 'left .15s' }}
        />
      </span>
    </button>
  )
}
