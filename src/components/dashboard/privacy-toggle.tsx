'use client'

import { usePrivacy } from '@/lib/privacy-mode'

export function PrivacyToggle() {
  const { enabled, toggle } = usePrivacy()
  return (
    <button
      onClick={toggle}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-bold transition-colors"
      style={{
        background: enabled ? '#0f172a' : '#f1f5f9',
        color: enabled ? '#fff' : '#64748b',
        border: `1px solid ${enabled ? '#0f172a' : '#e8ecf4'}`,
      }}
      title={enabled ? 'Modo apresentação ATIVO (telefones/emails ocultos)' : 'Ativar modo apresentação'}
    >
      <span className="text-[14px]" aria-hidden>{enabled ? '🙈' : '👁️'}</span>
      <span className="flex-1 text-left">{enabled ? 'Apresentação ON' : 'Apresentação'}</span>
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
