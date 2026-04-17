'use client'

import { useMemo } from 'react'

interface Props {
  value: string // "HH:mm" em formato 24h (para salvar)
  onChange: (v: string) => void
  disabled?: boolean
  className?: string
}

/**
 * TimePicker AM/PM — mostra 12h pro usuário mas salva em 24h internamente.
 *
 * value: "14:30" (24h) -> UI mostra 02:30 PM
 * onChange: sempre retorna "HH:mm" em 24h
 */
export function TimePicker({ value, onChange, disabled, className }: Props) {
  const { hour12, minute, ampm } = useMemo(() => {
    if (!value) return { hour12: '09', minute: '00', ampm: 'AM' as 'AM' | 'PM' }
    const [h24, m] = value.split(':').map(Number)
    const ampm = h24 >= 12 ? 'PM' : 'AM'
    let h12 = h24 % 12
    if (h12 === 0) h12 = 12
    return {
      hour12: String(h12).padStart(2, '0'),
      minute: String(m || 0).padStart(2, '0'),
      ampm: ampm as 'AM' | 'PM',
    }
  }, [value])

  function update(newHour: string, newMinute: string, newAmpm: 'AM' | 'PM') {
    let h = parseInt(newHour, 10)
    if (newAmpm === 'PM' && h !== 12) h += 12
    if (newAmpm === 'AM' && h === 12) h = 0
    const h24 = String(h).padStart(2, '0')
    onChange(`${h24}:${newMinute}`)
  }

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
  const minutes = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

  const baseCls = className || 'px-2 py-2 rounded-lg text-[13px] bg-[#f8f9fc] border border-[#e8ecf4] disabled:opacity-50'

  return (
    <div className="flex items-center gap-1">
      <select
        value={hour12}
        disabled={disabled}
        onChange={e => update(e.target.value, minute, ampm)}
        className={baseCls}
        style={{ width: 60 }}>
        {hours.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-[13px] font-bold" style={{ color: '#94a3b8' }}>:</span>
      <select
        value={minute}
        disabled={disabled}
        onChange={e => update(hour12, e.target.value, ampm)}
        className={baseCls}
        style={{ width: 62 }}>
        {minutes.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select
        value={ampm}
        disabled={disabled}
        onChange={e => update(hour12, minute, e.target.value as 'AM' | 'PM')}
        className={baseCls}
        style={{ width: 62 }}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}
