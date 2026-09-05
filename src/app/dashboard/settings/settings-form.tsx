'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { WaConnectCard } from '@/components/wa-connect-card'
import { useT } from '@/lib/i18n-client'
import { PERIOD_HOURS, hourLabel } from '@/lib/availability'

interface Buyer {
  id: string
  name: string
  phone: string
  whatsapp: string
  notification_phone_2?: string | null
  cal_link: string
  notification_email: boolean
  notification_sms: boolean
}

interface Props {
  buyer: Buyer
  activeStates: string[]
  activeAvailability: string[]
  /** { 'weekday_morning': [8,10] } — só pros períodos com hora escolhida. Vazio = período inteiro. */
  activeAvailabilityHours?: Record<string, number[]>
  allStates: string[]
}

interface SettingsPayload {
  buyer_id: string
  name: string
  phone: string
  whatsapp: string
  cal_link: string
  notification_phone_2: string | null
  notification_email: boolean
  notification_sms: boolean
  states: string[]
  availability: Array<{ day_type: string; period: string; hours: number[] | null }>
}

const DAY_KEYS = ['weekday', 'saturday', 'sunday', 'holiday'] as const
const PERIOD_KEYS = ['morning', 'afternoon', 'evening'] as const

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',
  DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',
  MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',
  NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',
  WI:'Wisconsin',WY:'Wyoming',DC:'Washington DC'
}

export function SettingsForm({ buyer, activeStates, activeAvailability, activeAvailabilityHours, allStates }: Props) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [name, setName] = useState(buyer.name || '')
  const [phone, setPhone] = useState(buyer.phone || '')
  const [whatsapp, setWhatsapp] = useState(buyer.whatsapp || '')
  const [notifPhone2, setNotifPhone2] = useState(buyer.notification_phone_2 || '')
  const [calLink, setCalLink] = useState(buyer.cal_link || '')
  const [notifEmail, setNotifEmail] = useState(buyer.notification_email)
  const [notifSms, setNotifSms] = useState(buyer.notification_sms)
  const [states, setStates] = useState<string[]>(activeStates)
  const [avail, setAvail] = useState<string[]>(activeAvailability)
  const [availHours, setAvailHours] = useState<Record<string, number[]>>(activeAvailabilityHours || {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingSaveRef = useRef<SettingsPayload | null>(null)
  const saveInFlightRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveDelayRef = useRef(650)
  const initialPayloadSignatureRef = useRef<string | null>(null)
  const saveErrorMessage = L(
    'Falha ao salvar automaticamente. Tente novamente.',
    'Automatic save failed. Please try again.',
    'No se pudo guardar automáticamente. Inténtalo de nuevo.',
  )

  const processSaveQueue = useCallback(async () => {
    if (saveInFlightRef.current) return
    saveInFlightRef.current = true
    let lastSaveSucceeded = false

    while (pendingSaveRef.current) {
      const payload = pendingSaveRef.current
      pendingSaveRef.current = null
      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Erro ${res.status}`)
        }
        lastSaveSucceeded = true
        setError(null)
      } catch (err: unknown) {
        // Se não chegou uma alteração mais nova enquanto esta requisição rodava,
        // preserva o payload para o botão de tentar novamente. Nunca perde o rascunho.
        if (!pendingSaveRef.current) pendingSaveRef.current = payload
        setError(err instanceof Error && err.message ? err.message : saveErrorMessage)
        lastSaveSucceeded = false
        break
      }
    }

    saveInFlightRef.current = false
    setSaving(false)
    if (lastSaveSucceeded && !pendingSaveRef.current) {
      setSaved(true)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaved(false), 1800)
    }
  }, [saveErrorMessage])

  const scheduleSave = useCallback((payload: SettingsPayload, delay: number) => {
    pendingSaveRef.current = payload
    setSaving(true)
    setSaved(false)
    setError(null)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void processSaveQueue()
    }, delay)
  }, [processSaveQueue])

  const flushAutosave = useCallback(() => {
    // Se o blur acontecer antes do effect que monta o payload, a próxima
    // execução também deve salvar imediatamente, sem esperar o debounce.
    autosaveDelayRef.current = 0
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (pendingSaveRef.current) void processSaveQueue()
  }, [processSaveQueue])

  useEffect(() => {
    const payload: SettingsPayload = {
      buyer_id: buyer.id,
      name,
      phone,
      whatsapp,
      cal_link: calLink,
      notification_phone_2: notifPhone2.trim() || null,
      notification_email: notifEmail,
      notification_sms: notifSms,
      states,
      availability: avail.map(a => {
        const [day_type, period] = a.split('_')
        const hours = availHours[a] || []
        return { day_type, period, hours: hours.length ? hours : null }
      }),
    }
    const signature = JSON.stringify(payload)
    if (initialPayloadSignatureRef.current === null) {
      initialPayloadSignatureRef.current = signature
      return
    }
    if (signature === initialPayloadSignatureRef.current) return
    initialPayloadSignatureRef.current = signature
    const delay = autosaveDelayRef.current
    autosaveDelayRef.current = 650
    scheduleSave(payload, delay)
  }, [buyer.id, name, phone, whatsapp, calLink, notifPhone2, notifEmail, notifSms, states, avail, availHours, scheduleSave])

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
  }, [])

  function markTextChange() {
    autosaveDelayRef.current = 650
  }

  function markSelectionChange() {
    autosaveDelayRef.current = 0
  }

  function toggleState(code: string) {
    markSelectionChange()
    setStates(prev => prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code])
  }

  function toggleAvail(key: string) {
    markSelectionChange()
    const wasOn = avail.includes(key)
    setAvail(prev => wasOn ? prev.filter(a => a !== key) : [...prev, key])
    // Desligou o período → some com as horas dele (senão salvaria hora de período inativo).
    if (wasOn) setAvailHours(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  /** Liga/desliga 1 hora dentro do período. Nenhuma hora marcada = período INTEIRO. */
  function toggleHour(key: string, h: number) {
    markSelectionChange()
    setAvailHours(prev => {
      const cur = prev[key] || []
      const next = cur.includes(h) ? cur.filter(x => x !== h) : [...cur, h].sort((a, b) => a - b)
      return { ...prev, [key]: next }
    })
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-[12px] font-semibold" style={{ color: 'var(--fg-muted)' }}>
        <span style={{ color: '#10b981' }}>●</span>
        {L('Salvamento automático ativado', 'Automatic saving enabled', 'Guardado automático activado')}
      </div>

      {/* WhatsApp connect */}
      <WaConnectCard />

      {/* Profile */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h2 className="text-[15px] font-bold mb-4" style={{ color: 'var(--fg)' }}>{t.settings.profile}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-bold mb-1" style={{ color: 'var(--fg-secondary)' }}>{t.settings.name}</label>
            <input type="text" value={name} onChange={(e) => { markTextChange(); setName(e.target.value) }} onBlur={flushAutosave}
              className="w-full px-4 py-3 rounded-xl text-[14px] font-medium" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }} />
          </div>
          <div>
            <label className="block text-[12px] font-bold mb-1" style={{ color: 'var(--fg-secondary)' }}>{t.settings.phone}</label>
            <input type="tel" value={phone} onChange={(e) => { markTextChange(); setPhone(e.target.value) }} onBlur={flushAutosave}
              className="w-full px-4 py-3 rounded-xl text-[14px] font-medium" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }} />
          </div>
          <div>
            <label className="block text-[12px] font-bold mb-1" style={{ color: 'var(--fg-secondary)' }}>{t.settings.whatsapp}</label>
            <input type="tel" value={whatsapp} onChange={(e) => { markTextChange(); setWhatsapp(e.target.value) }} onBlur={flushAutosave}
              className="w-full px-4 py-3 rounded-xl text-[14px] font-medium" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }} />
          </div>
          <div>
            <label className="block text-[12px] font-bold mb-1" style={{ color: 'var(--fg-secondary)' }}>
              {L('2º número para notificações', '2nd number for notifications', '2º número para notificaciones')} <span style={{ fontWeight: 500, color: 'var(--fg-muted)' }}>{L('(opcional)', '(optional)', '(opcional)')}</span>
            </label>
            <input type="tel" value={notifPhone2} onChange={(e) => { markTextChange(); setNotifPhone2(e.target.value) }} onBlur={flushAutosave}
              placeholder="+1 407 555 0100"
              className="w-full px-4 py-3 rounded-xl text-[14px] font-medium" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }} />
            <p className="text-[11px] mt-1" style={{ color: 'var(--fg-muted)' }}>
              {L('Recebe o mesmo alerta de ', 'Gets the same ', 'Recibe la misma alerta de ')}<b>{L('Novo Lead', 'New Lead', 'Nuevo Lead')}</b>{L(' que o seu telefone principal. ', ' alert as your main phone. ', ' que tu teléfono principal. ')}<b>{L('Não precisa conectar WhatsApp', 'No need to connect WhatsApp', 'No hace falta conectar WhatsApp')}</b>{L(' — só precisa ser um número que tenha WhatsApp.', ' — it just needs to be a number with WhatsApp on it.', ' — solo necesita ser un número que tenga WhatsApp.')}
            </p>
          </div>
          <div>
            <label className="block text-[12px] font-bold mb-1" style={{ color: 'var(--fg-secondary)' }}>{L('Cal.com Link', 'Cal.com Link', 'Enlace de Cal.com')}</label>
            <input type="url" value={calLink} onChange={(e) => { markTextChange(); setCalLink(e.target.value) }} onBlur={flushAutosave} placeholder={L('https://cal.com/seu-nome', 'https://cal.com/your-name', 'https://cal.com/tu-nombre')}
              className="w-full px-4 py-3 rounded-xl text-[14px] font-medium" style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }} />
          </div>
        </div>
      </div>

      {/* States / Licenses */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h2 className="text-[15px] font-bold mb-2" style={{ color: 'var(--fg)' }}>{t.settings.statesTitle}</h2>
        <p className="text-[13px] mb-4" style={{ color: 'var(--fg-muted)' }}>{t.settings.statesHelp}</p>
        <div className="flex flex-wrap gap-2">
          {allStates.map(code => (
            <button
              type="button"
              key={code}
              onClick={() => toggleState(code)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all"
              style={{
                background: states.includes(code) ? 'var(--accent)' : 'var(--bg)',
                color: states.includes(code) ? '#fff' : 'var(--fg-secondary)',
                border: `1px solid ${states.includes(code) ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {code}
            </button>
          ))}
        </div>
        {states.length > 0 && (
          <p className="text-[12px] mt-3" style={{ color: 'var(--accent)' }}>
            {t.settings.statesSelected(states.length)}: {states.map(s => STATE_NAMES[s] || s).join(', ')}
          </p>
        )}
      </div>

      {/* Availability (for appointments) */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h2 className="text-[15px] font-bold mb-2" style={{ color: 'var(--fg)' }}>{t.settings.availTitle}</h2>
        <p className="text-[13px] mb-4" style={{ color: 'var(--fg-muted)' }}>{t.settings.availHelp}</p>
        <div className="space-y-3">
          {DAY_KEYS.map(dayKey => {
            const dayLabel =
              dayKey === 'weekday' ? t.settings.weekdays
              : dayKey === 'saturday' ? t.settings.saturday
              : dayKey === 'sunday' ? t.settings.sunday
              : t.settings.holidays
            return (
              <div key={dayKey}>
                <p className="text-[13px] font-bold mb-2" style={{ color: 'var(--fg)' }}>{dayLabel}</p>
                <div className="flex gap-2">
                  {PERIOD_KEYS.map(periodKey => {
                    const periodLabel =
                      periodKey === 'morning' ? t.settings.morning
                      : periodKey === 'afternoon' ? t.settings.afternoon
                      : t.settings.evening
                    const key = `${dayKey}_${periodKey}`
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => toggleAvail(key)}
                        className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all"
                        style={{
                          background: avail.includes(key) ? 'var(--accent)' : 'var(--bg)',
                          color: avail.includes(key) ? '#fff' : 'var(--fg-secondary)',
                          border: `1px solid ${avail.includes(key) ? 'var(--accent)' : 'var(--border)'}`,
                        }}
                      >
                        {periodLabel}
                      </button>
                    )
                  })}
                </div>

                {/* Granularidade opcional de 1h: aparece só nos períodos ATIVOS.
                    Nenhuma hora marcada = período inteiro (padrão de sempre). */}
                {PERIOD_KEYS.filter(pk => avail.includes(`${dayKey}_${pk}`)).map(pk => {
                  const key = `${dayKey}_${pk}`
                  const hrs = availHours[key] || []
                  const pLabel = pk === 'morning' ? t.settings.morning : pk === 'afternoon' ? t.settings.afternoon : t.settings.evening
                  return (
                    <div key={key} className="mt-2 ml-1 pl-3" style={{ borderLeft: '2px solid #eef2ff' }}>
                      <p className="text-[11px] mb-1.5" style={{ color: 'var(--fg-muted)' }}>
                        {pLabel} · {hrs.length === 0
                          ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{L('período todo', 'entire period', 'todo el período')}</span>
                          : <span style={{ color: '#6d28d9', fontWeight: 600 }}>{hrs.length} {L(hrs.length > 1 ? 'horários escolhidos' : 'horário escolhido', hrs.length > 1 ? 'hours selected' : 'hour selected', hrs.length > 1 ? 'horas elegidas' : 'hora elegida')}</span>}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {PERIOD_HOURS[pk].map(h => {
                          const on = hrs.includes(h)
                          return (
                            <button key={h} onClick={() => toggleHour(key, h)} type="button"
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                              style={{
                                background: on ? '#6d28d9' : '#fff',
                                color: on ? '#fff' : 'var(--fg-secondary)',
                                border: `1px solid ${on ? '#6d28d9' : 'var(--border)'}`,
                              }}>
                              {hourLabel(h)}
                            </button>
                          )
                        })}
                        {hrs.length > 0 && (
                          <button type="button" onClick={() => { markSelectionChange(); setAvailHours(prev => ({ ...prev, [key]: [] })) }}
                            className="px-2 py-1 text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>
                            {L('limpar (período todo)', 'clear (entire period)', 'limpiar (todo el período)')}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h2 className="text-[15px] font-bold mb-4" style={{ color: 'var(--fg)' }}>{t.settings.notifTitle}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>{t.settings.email}</p>
              <p className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>{t.settings.emailHelp}</p>
            </div>
            <button type="button" onClick={() => { markSelectionChange(); setNotifEmail(!notifEmail) }}
              className="w-11 h-6 rounded-full relative" style={{ background: notifEmail ? '#10b981' : '#d1d5db' }}>
              <span className="absolute w-5 h-5 bg-white rounded-full top-0.5 shadow" style={{ left: notifEmail ? '22px' : '2px', transition: 'left .2s' }} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>{t.settings.sms}</p>
              <p className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>{t.settings.smsHelp}</p>
            </div>
            <button type="button" onClick={() => { markSelectionChange(); setNotifSms(!notifSms) }}
              className="w-11 h-6 rounded-full relative" style={{ background: notifSms ? '#10b981' : '#d1d5db' }}>
              <span className="absolute w-5 h-5 bg-white rounded-full top-0.5 shadow" style={{ left: notifSms ? '22px' : '2px', transition: 'left .2s' }} />
            </button>
          </div>

          <a href="/dashboard/settings/notifications"
            className="flex items-center justify-between p-3 rounded-xl mt-2 transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)', border: '1px solid rgba(139,92,246,0.35)', textDecoration: 'none' }}>
            <div>
              <p className="text-[13px] font-bold" style={{ color: '#6d28d9' }}>🔔 {L('Gestão de avisos de reunião', 'Meeting reminder settings', 'Gestión de avisos de reunión')} →</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--accent)' }}>{L('Banner ao vivo, alerta sonoro, push do navegador, WhatsApp lembrete', 'Live banner, sound alert, browser push, WhatsApp reminder', 'Banner en vivo, alerta de sonido, push del navegador, recordatorio por WhatsApp')}</p>
            </div>
          </a>
        </div>
      </div>

      {(saving || saved || error) && (
        <div
          aria-live="polite"
          className="fixed right-5 bottom-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold shadow-lg"
          style={error
            ? { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }
            : saved
              ? { background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }
              : { background: 'var(--bg-card)', color: 'var(--fg-secondary)', border: '1px solid var(--border)' }}
        >
          {error ? '⚠️' : saved ? '✅' : <span className="w-3.5 h-3.5 rounded-full border-2 border-violet-200 border-t-violet-600 animate-spin" />}
          <span>{error || (saved
            ? L('Salvo automaticamente', 'Saved automatically', 'Guardado automáticamente')
            : L('Salvando...', 'Saving...', 'Guardando...'))}</span>
          {error && (
            <button
              type="button"
              onClick={() => { setError(null); setSaving(true); void processSaveQueue() }}
              className="ml-1 underline font-extrabold"
            >
              {L('Tentar novamente', 'Try again', 'Intentar de nuevo')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
