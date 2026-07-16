'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { WaConnectCard } from '@/components/wa-connect-card'
import { useT } from '@/lib/i18n-client'
import { PERIOD_HOURS } from '@/lib/availability'

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
  const router = useRouter()
  const t = useT()
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

  function toggleState(code: string) {
    setStates(prev => prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code])
  }

  function toggleAvail(key: string) {
    const wasOn = avail.includes(key)
    setAvail(prev => wasOn ? prev.filter(a => a !== key) : [...prev, key])
    // Desligou o período → some com as horas dele (senão salvaria hora de período inativo).
    if (wasOn) setAvailHours(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  /** Liga/desliga 1 hora dentro do período. Nenhuma hora marcada = período INTEIRO. */
  function toggleHour(key: string, h: number) {
    setAvailHours(prev => {
      const cur = prev[key] || []
      const next = cur.includes(h) ? cur.filter(x => x !== h) : [...cur, h].sort((a, b) => a - b)
      return { ...prev, [key]: next }
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_id: buyer.id,
          name, phone, whatsapp, cal_link: calLink,
          notification_phone_2: notifPhone2.trim() || null,
          notification_email: notifEmail, notification_sms: notifSms,
          states,
          availability: avail.map(a => {
            const [day_type, period] = a.split('_')
            // hours vazio → null = período inteiro (retrocompatível).
            const hours = availHours[a] || []
            return { day_type, period, hours: hours.length ? hours : null }
          }),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Erro ${res.status}`)
      }

      setSaved(true)
      // Mostra o "Salvo" rapidamente e manda pro dashboard
      setTimeout(() => {
        router.push('/dashboard')
      }, 800)
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {saved && (
        <div className="mb-6 px-5 py-3 rounded-xl text-[13px] font-semibold" style={{ background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0' }}>
          {t.settings.savedOk}
        </div>
      )}

      {error && (
        <div className="mb-6 px-5 py-3 rounded-xl text-[13px] font-semibold" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
          ⚠️ {error}
        </div>
      )}

      {/* WhatsApp connect */}
      <WaConnectCard />

      {/* Profile */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold mb-4" style={{ color: '#1a1a2e' }}>{t.settings.profile}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-bold mb-1" style={{ color: '#64748b' }}>{t.settings.name}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
          </div>
          <div>
            <label className="block text-[12px] font-bold mb-1" style={{ color: '#64748b' }}>{t.settings.phone}</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
          </div>
          <div>
            <label className="block text-[12px] font-bold mb-1" style={{ color: '#64748b' }}>{t.settings.whatsapp}</label>
            <input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
          </div>
          <div>
            <label className="block text-[12px] font-bold mb-1" style={{ color: '#64748b' }}>
              2º número para notificações <span style={{ fontWeight: 500, color: '#94a3b8' }}>(opcional)</span>
            </label>
            <input type="tel" value={notifPhone2} onChange={(e) => setNotifPhone2(e.target.value)}
              placeholder="+1 407 555 0100"
              className="w-full px-4 py-3 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
            <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>
              Recebe o mesmo alerta de <b>Novo Lead</b> que o seu telefone principal. <b>Não precisa conectar WhatsApp</b> — só precisa ser um número que tenha WhatsApp.
            </p>
          </div>
          <div>
            <label className="block text-[12px] font-bold mb-1" style={{ color: '#64748b' }}>Cal.com Link</label>
            <input type="url" value={calLink} onChange={(e) => setCalLink(e.target.value)} placeholder="https://cal.com/seu-nome"
              className="w-full px-4 py-3 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
          </div>
        </div>
      </div>

      {/* States / Licenses */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold mb-2" style={{ color: '#1a1a2e' }}>{t.settings.statesTitle}</h2>
        <p className="text-[13px] mb-4" style={{ color: '#94a3b8' }}>{t.settings.statesHelp}</p>
        <div className="flex flex-wrap gap-2">
          {allStates.map(code => (
            <button
              key={code}
              onClick={() => toggleState(code)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all"
              style={{
                background: states.includes(code) ? '#6366f1' : '#f8f9fc',
                color: states.includes(code) ? '#fff' : '#64748b',
                border: `1px solid ${states.includes(code) ? '#6366f1' : '#e8ecf4'}`,
              }}
            >
              {code}
            </button>
          ))}
        </div>
        {states.length > 0 && (
          <p className="text-[12px] mt-3" style={{ color: '#6366f1' }}>
            {t.settings.statesSelected(states.length)}: {states.map(s => STATE_NAMES[s] || s).join(', ')}
          </p>
        )}
      </div>

      {/* Availability (for appointments) */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold mb-2" style={{ color: '#1a1a2e' }}>{t.settings.availTitle}</h2>
        <p className="text-[13px] mb-4" style={{ color: '#94a3b8' }}>{t.settings.availHelp}</p>
        <div className="space-y-3">
          {DAY_KEYS.map(dayKey => {
            const dayLabel =
              dayKey === 'weekday' ? t.settings.weekdays
              : dayKey === 'saturday' ? t.settings.saturday
              : dayKey === 'sunday' ? t.settings.sunday
              : t.settings.holidays
            return (
              <div key={dayKey}>
                <p className="text-[13px] font-bold mb-2" style={{ color: '#1a1a2e' }}>{dayLabel}</p>
                <div className="flex gap-2">
                  {PERIOD_KEYS.map(periodKey => {
                    const periodLabel =
                      periodKey === 'morning' ? t.settings.morning
                      : periodKey === 'afternoon' ? t.settings.afternoon
                      : t.settings.evening
                    const key = `${dayKey}_${periodKey}`
                    return (
                      <button
                        key={key}
                        onClick={() => toggleAvail(key)}
                        className="px-4 py-2 rounded-xl text-[12px] font-semibold transition-all"
                        style={{
                          background: avail.includes(key) ? '#6366f1' : '#f8f9fc',
                          color: avail.includes(key) ? '#fff' : '#64748b',
                          border: `1px solid ${avail.includes(key) ? '#6366f1' : '#e8ecf4'}`,
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
                      <p className="text-[11px] mb-1.5" style={{ color: '#94a3b8' }}>
                        {pLabel} · {hrs.length === 0
                          ? <span style={{ color: '#6366f1', fontWeight: 600 }}>período todo</span>
                          : <span style={{ color: '#4338ca', fontWeight: 600 }}>{hrs.length}h escolhida{hrs.length > 1 ? 's' : ''}</span>}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {PERIOD_HOURS[pk].map(h => {
                          const on = hrs.includes(h)
                          return (
                            <button key={h} onClick={() => toggleHour(key, h)} type="button"
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                              style={{
                                background: on ? '#4338ca' : '#fff',
                                color: on ? '#fff' : '#64748b',
                                border: `1px solid ${on ? '#4338ca' : '#e8ecf4'}`,
                              }}>
                              {h}h
                            </button>
                          )
                        })}
                        {hrs.length > 0 && (
                          <button type="button" onClick={() => setAvailHours(prev => ({ ...prev, [key]: [] }))}
                            className="px-2 py-1 text-[11px] font-semibold" style={{ color: '#6366f1' }}>
                            limpar (período todo)
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
      <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold mb-4" style={{ color: '#1a1a2e' }}>{t.settings.notifTitle}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{t.settings.email}</p>
              <p className="text-[11px]" style={{ color: '#94a3b8' }}>{t.settings.emailHelp}</p>
            </div>
            <button onClick={() => setNotifEmail(!notifEmail)}
              className="w-11 h-6 rounded-full relative" style={{ background: notifEmail ? '#10b981' : '#d1d5db' }}>
              <span className="absolute w-5 h-5 bg-white rounded-full top-0.5 shadow" style={{ left: notifEmail ? '22px' : '2px', transition: 'left .2s' }} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>{t.settings.sms}</p>
              <p className="text-[11px]" style={{ color: '#94a3b8' }}>{t.settings.smsHelp}</p>
            </div>
            <button onClick={() => setNotifSms(!notifSms)}
              className="w-11 h-6 rounded-full relative" style={{ background: notifSms ? '#10b981' : '#d1d5db' }}>
              <span className="absolute w-5 h-5 bg-white rounded-full top-0.5 shadow" style={{ left: notifSms ? '22px' : '2px', transition: 'left .2s' }} />
            </button>
          </div>

          <a href="/dashboard/settings/notifications"
            className="flex items-center justify-between p-3 rounded-xl mt-2 transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)', border: '1px solid #c7d2fe', textDecoration: 'none' }}>
            <div>
              <p className="text-[13px] font-bold" style={{ color: '#4338ca' }}>🔔 Gestão de avisos de reunião →</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#6366f1' }}>Banner ao vivo, alerta sonoro, push do navegador, WhatsApp lembrete</p>
            </div>
          </a>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={saving}
          className="px-6 py-3 rounded-xl text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
          {saving ? t.common.saving : t.settings.saveBtn}
        </button>
        {saved && (
          <span className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: '#10b981' }}>
            ✅ Salvo com sucesso
          </span>
        )}
        {error && !saving && (
          <span className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: '#dc2626' }}>
            ⚠️ {error}
          </span>
        )}
      </div>
    </div>
  )
}
