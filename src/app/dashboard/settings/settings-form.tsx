'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { WaConnectCard } from '@/components/wa-connect-card'

interface Buyer {
  id: string
  name: string
  phone: string
  whatsapp: string
  cal_link: string
  notification_email: boolean
  notification_sms: boolean
}

interface Props {
  buyer: Buyer
  activeStates: string[]
  activeAvailability: string[]
  allStates: string[]
}

const DAY_TYPES = [
  { key: 'weekday', label: 'Seg-Sex' },
  { key: 'saturday', label: 'Sabado' },
  { key: 'sunday', label: 'Domingo' },
  { key: 'holiday', label: 'Feriados' },
]

const PERIODS = [
  { key: 'morning', label: 'Manha (8h-12h)' },
  { key: 'afternoon', label: 'Tarde (12h-18h)' },
  { key: 'evening', label: 'Noite (18h-21h)' },
]

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

export function SettingsForm({ buyer, activeStates, activeAvailability, allStates }: Props) {
  const router = useRouter()
  const [name, setName] = useState(buyer.name || '')
  const [phone, setPhone] = useState(buyer.phone || '')
  const [whatsapp, setWhatsapp] = useState(buyer.whatsapp || '')
  const [calLink, setCalLink] = useState(buyer.cal_link || '')
  const [notifEmail, setNotifEmail] = useState(buyer.notification_email)
  const [notifSms, setNotifSms] = useState(buyer.notification_sms)
  const [states, setStates] = useState<string[]>(activeStates)
  const [avail, setAvail] = useState<string[]>(activeAvailability)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleState(code: string) {
    setStates(prev => prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code])
  }

  function toggleAvail(key: string) {
    setAvail(prev => prev.includes(key) ? prev.filter(a => a !== key) : [...prev, key])
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
          notification_email: notifEmail, notification_sms: notifSms,
          states,
          availability: avail.map(a => {
            const [day_type, period] = a.split('_')
            return { day_type, period }
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
          ✅ Configuracoes salvas!
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
        <h2 className="text-[15px] font-bold mb-4" style={{ color: '#1a1a2e' }}>Perfil</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12px] font-bold mb-1" style={{ color: '#64748b' }}>Nome</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
          </div>
          <div>
            <label className="block text-[12px] font-bold mb-1" style={{ color: '#64748b' }}>Telefone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
          </div>
          <div>
            <label className="block text-[12px] font-bold mb-1" style={{ color: '#64748b' }}>WhatsApp</label>
            <input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-[14px] font-medium" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
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
        <h2 className="text-[15px] font-bold mb-2" style={{ color: '#1a1a2e' }}>📍 Estados com Licenca</h2>
        <p className="text-[13px] mb-4" style={{ color: '#94a3b8' }}>Selecione os estados onde voce tem licenca pra vender seguro. Voce so recebera leads desses estados.</p>
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
            {states.length} estado{states.length > 1 ? 's' : ''} selecionado{states.length > 1 ? 's' : ''}: {states.map(s => STATE_NAMES[s] || s).join(', ')}
          </p>
        )}
      </div>

      {/* Availability (for appointments) */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold mb-2" style={{ color: '#1a1a2e' }}>📅 Disponibilidade para Appointments</h2>
        <p className="text-[13px] mb-4" style={{ color: '#94a3b8' }}>Selecione quando voce pode receber appointments agendados.</p>
        <div className="space-y-3">
          {DAY_TYPES.map(day => (
            <div key={day.key}>
              <p className="text-[13px] font-bold mb-2" style={{ color: '#1a1a2e' }}>{day.label}</p>
              <div className="flex gap-2">
                {PERIODS.map(period => {
                  const key = `${day.key}_${period.key}`
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
                      {period.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold mb-4" style={{ color: '#1a1a2e' }}>🔔 Notificacoes</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>Email</p>
              <p className="text-[11px]" style={{ color: '#94a3b8' }}>Receber leads por email</p>
            </div>
            <button onClick={() => setNotifEmail(!notifEmail)}
              className="w-11 h-6 rounded-full relative" style={{ background: notifEmail ? '#10b981' : '#d1d5db' }}>
              <span className="absolute w-5 h-5 bg-white rounded-full top-0.5 shadow" style={{ left: notifEmail ? '22px' : '2px', transition: 'left .2s' }} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>SMS</p>
              <p className="text-[11px]" style={{ color: '#94a3b8' }}>Receber leads por SMS</p>
            </div>
            <button onClick={() => setNotifSms(!notifSms)}
              className="w-11 h-6 rounded-full relative" style={{ background: notifSms ? '#10b981' : '#d1d5db' }}>
              <span className="absolute w-5 h-5 bg-white rounded-full top-0.5 shadow" style={{ left: notifSms ? '22px' : '2px', transition: 'left .2s' }} />
            </button>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={save} disabled={saving}
          className="px-6 py-3 rounded-xl text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: '#6366f1', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
          {saving ? 'Salvando...' : 'Salvar Configuracoes'}
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
