'use client'

import { useState, useEffect } from 'react'
import { startCheckout } from '@/lib/checkout-client'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]

const DAY_TYPES = (locale: string) => [
  { key: 'weekday', label: locale === 'en' ? 'Mon-Fri' : locale === 'es' ? 'Lun-Vie' : 'Seg-Sex' },
  { key: 'saturday', label: locale === 'en' ? 'Saturday' : locale === 'es' ? 'Sábado' : 'Sabado' },
  { key: 'sunday', label: locale === 'en' ? 'Sunday' : locale === 'es' ? 'Domingo' : 'Domingo' },
]

const PERIODS = (locale: string) => [
  { key: 'morning', label: locale === 'en' ? 'Morning' : locale === 'es' ? 'Mañana' : 'Manha' },
  { key: 'afternoon', label: locale === 'en' ? 'Afternoon' : locale === 'es' ? 'Tarde' : 'Tarde' },
  { key: 'evening', label: locale === 'en' ? 'Evening' : locale === 'es' ? 'Noche' : 'Noite' },
]

const ALL_AVAIL = DAY_TYPES('pt').flatMap(d => PERIODS('pt').map(p => `${d.key}_${p.key}`))

const TOTAL_STEPS = 5

export default function OnboardingPage() {
  const router = useRouter()
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const dayTypes = DAY_TYPES(t._locale)
  const periods = PERIODS(t._locale)
  const [step, setStep] = useState(1)
  const [states, setStates] = useState<string[]>([])
  const [avail, setAvail] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  // App nativo (iOS/Android) não vê a etapa de compra/assinatura (Guia 3.1.1) — vai direto pro app.
  const [isNative] = useState(() => typeof window !== 'undefined' && (/Lead4ProApp/i.test(navigator.userAgent) || !!(window as any).Capacitor))
  useEffect(() => { if (isNative) router.replace('/m') }, [isNative])

  function toggleState(code: string) {
    setStates(prev => prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code])
  }

  function toggleAvail(key: string) {
    setAvail(prev => prev.includes(key) ? prev.filter(a => a !== key) : [...prev, key])
  }

  function getAuthId() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    if (!cookie) return null
    try {
      const token = JSON.parse(atob(decodeURIComponent(cookie.substring(cookie.indexOf('=') + 1))))
      const payload = JSON.parse(atob(token.access_token.split('.')[1]))
      return payload.sub
    } catch { return null }
  }

  async function saveSettings() {
    const authId = getAuthId()
    if (!authId) return
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_user_id: authId,
        states,
        availability: avail.map(a => {
          const [day_type, period] = a.split('_')
          return { day_type, period }
        }),
      }),
    })
  }

  async function finishOnboarding(action: 'free' | 'leads' | 'crm') {
    setSaving(true)
    const authId = getAuthId()
    if (authId) {
      // Mark onboarding completed
      await fetch('/api/onboarding/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_user_id: authId, completed: true }),
      })
    }

    if (action === 'free') {
      window.location.href = '/dashboard'
    } else if (action === 'leads') {
      window.location.href = '/dashboard/credits'
    } else if (action === 'crm') {
      // 2026-07-29: manda pros 4 planos (antes assinava o mensal direto = upsell perdido)
      window.location.href = '/dashboard/planos'
    }
  }

  async function nextStep() {
    if (step === 3) {
      // Save states + availability before showing plan
      await saveSettings()
    }
    setStep(s => Math.min(TOTAL_STEPS, s + 1))
  }

  if (isNative) return <div style={{ minHeight: '100dvh', background: '#0b0b12' }} />

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'linear-gradient(160deg, #0f0a2e 0%, #1e1b4b 50%, #312e81 100%)' }}>
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-black mx-auto mb-3" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>L</div>
          <h1 className="text-[22px] sm:text-[26px] font-extrabold text-white">{L('Bem-vindo ao Lead4Producers', 'Welcome to Lead4Producers', 'Bienvenido a Lead4Producers')}</h1>
          <p className="text-[13px] sm:text-[14px] mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>{L('Vamos configurar sua conta — leva menos de 2 minutos', "Let's set up your account — it takes less than 2 minutes", 'Vamos a configurar tu cuenta — toma menos de 2 minutos')}</p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full transition-all" style={{ background: i < step ? '#6366f1' : 'rgba(255,255,255,0.1)' }} />
          ))}
        </div>

        {/* Step 1 — Welcome */}
        {step === 1 && (
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-center mb-6">
              <span className="text-[40px] block mb-3">👋</span>
              <h2 className="text-[20px] font-bold text-white mb-2">{L('Como funciona em 3 passos', 'How it works in 3 steps', 'Cómo funciona en 3 pasos')}</h2>
              <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{L('Veja como Lead4Producers vai funcionar pra voce', 'See how Lead4Producers will work for you', 'Mira cómo Lead4Producers va a funcionar para ti')}</p>
            </div>

            <div className="space-y-3 mb-6">
              {[
                { icon: '⚙️', title: L('Configure sua conta', 'Set up your account', 'Configura tu cuenta'), desc: L('Estados onde tem licenca + horarios disponiveis', 'States where you are licensed + available hours', 'Estados donde tienes licencia + horarios disponibles') },
                { icon: '💳', title: L('Compre leads ou assine o CRM', 'Buy leads or subscribe to the CRM', 'Compra leads o suscríbete al CRM'), desc: L('Pacote de leads ($22/un) ou CRM Pro ($99/mes) com pipeline e gestao de time', 'Lead package ($22/each) or CRM Pro ($99/mo) with pipeline and team management', 'Paquete de leads ($22 c/u) o CRM Pro ($99/mes) con pipeline y gestión de equipo') },
                { icon: '🚀', title: L('Receba leads no WhatsApp', 'Get leads on WhatsApp', 'Recibe leads por WhatsApp'), desc: L('Em tempo real. Voce so liga e fecha. Pipeline organiza tudo.', 'In real time. You just call and close. The pipeline organizes everything.', 'En tiempo real. Tú solo llamas y cierras. El pipeline organiza todo.') },
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(99,102,241,0.2)' }}>
                    <span className="text-[16px]">{s.icon}</span>
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-white">{s.title}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={() => setStep(2)}
              className="w-full py-3.5 rounded-xl font-bold text-[14px] text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              {L('Vamos comecar →', "Let's get started →", 'Empecemos →')}
            </button>
          </div>
        )}

        {/* Step 2 — States */}
        {step === 2 && (
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[24px]">📍</span>
              <h2 className="text-[18px] font-bold text-white">{L('Seus estados', 'Your states', 'Tus estados')}</h2>
            </div>
            <p className="text-[13px] mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>{L('Selecione os estados onde voce tem licenca pra vender seguro. Voce so recebera leads desses estados.', "Select the states where you're licensed to sell insurance. You'll only receive leads from those states.", 'Selecciona los estados donde tienes licencia para vender seguros. Solo recibirás leads de esos estados.')}</p>
            <div className="flex items-center gap-2 mb-3">
              <button type="button" onClick={() => setStates([...US_STATES])} className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all" style={{ background: 'rgba(99,102,241,0.25)', color: '#c4b5fd', border: '1px solid rgba(99,102,241,0.4)' }}>{L('✓ Selecionar todos', '✓ Select all', '✓ Seleccionar todos')}</button>
              <button type="button" onClick={() => setStates([])} className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>{L('Limpar', 'Clear', 'Limpiar')}</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-6">
              {US_STATES.map(code => (
                <button key={code} onClick={() => toggleState(code)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all"
                  style={{
                    background: states.includes(code) ? '#6366f1' : 'rgba(255,255,255,0.06)',
                    color: states.includes(code) ? '#fff' : 'rgba(255,255,255,0.4)',
                    border: `1px solid ${states.includes(code) ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
                  }}>
                  {code}
                </button>
              ))}
            </div>
            {states.length > 0 && (
              <p className="text-[12px] mb-4" style={{ color: '#a78bfa' }}>{L(`${states.length} estado${states.length > 1 ? 's' : ''} selecionado${states.length > 1 ? 's' : ''}`, `${states.length} state${states.length > 1 ? 's' : ''} selected`, `${states.length} estado${states.length > 1 ? 's' : ''} seleccionado${states.length > 1 ? 's' : ''}`)}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="px-6 py-3.5 rounded-xl font-bold text-[14px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {L('← Voltar', '← Back', '← Volver')}
              </button>
              <button onClick={() => setStep(3)} disabled={states.length === 0}
                className="flex-1 py-3.5 rounded-xl font-bold text-[14px] text-white disabled:opacity-30"
                style={{ background: '#6366f1' }}>
                {L('Proximo →', 'Next →', 'Siguiente →')}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Availability */}
        {step === 3 && (
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[24px]">📅</span>
              <h2 className="text-[18px] font-bold text-white">{L('Disponibilidade', 'Availability', 'Disponibilidad')}</h2>
            </div>
            <p className="text-[13px] mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>{L('Quando voce pode atender? (Opcional — pode pular se quiser so leads)', 'When can you take calls? (Optional — skip it if you only want leads)', '¿Cuándo puedes atender? (Opcional — puedes saltarlo si solo quieres leads)')}</p>
            <div className="flex items-center gap-2 mb-4">
              <button type="button" onClick={() => setAvail([...ALL_AVAIL])} className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all" style={{ background: 'rgba(99,102,241,0.25)', color: '#c4b5fd', border: '1px solid rgba(99,102,241,0.4)' }}>{L('✓ Selecionar todos', '✓ Select all', '✓ Seleccionar todos')}</button>
              <button type="button" onClick={() => setAvail([])} className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>{L('Limpar', 'Clear', 'Limpiar')}</button>
            </div>
            <div className="space-y-4 mb-6">
              {dayTypes.map(day => (
                <div key={day.key}>
                  <p className="text-[13px] font-bold text-white mb-2">{day.label}</p>
                  <div className="flex gap-2">
                    {periods.map(period => {
                      const key = `${day.key}_${period.key}`
                      return (
                        <button key={key} onClick={() => toggleAvail(key)}
                          className="flex-1 py-2 rounded-xl text-[11px] sm:text-[12px] font-semibold transition-all"
                          style={{
                            background: avail.includes(key) ? '#6366f1' : 'rgba(255,255,255,0.06)',
                            color: avail.includes(key) ? '#fff' : 'rgba(255,255,255,0.4)',
                            border: `1px solid ${avail.includes(key) ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
                          }}>
                          {period.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="px-6 py-3.5 rounded-xl font-bold text-[14px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {L('← Voltar', '← Back', '← Volver')}
              </button>
              <button onClick={nextStep}
                className="flex-1 py-3.5 rounded-xl font-bold text-[14px] text-white"
                style={{ background: '#6366f1' }}>
                {L('Proximo →', 'Next →', 'Siguiente →')}
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Plan */}
        {step === 4 && (
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-center mb-6">
              <span className="text-[32px] block mb-2">🚀</span>
              <h2 className="text-[20px] font-bold text-white">{L('Como quer comecar?', 'How do you want to start?', '¿Cómo quieres empezar?')}</h2>
              <p className="text-[13px] mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{L('Escolha o melhor plano. Pode mudar depois.', 'Pick the best plan. You can change it later.', 'Elige el mejor plan. Puedes cambiarlo después.')}</p>
            </div>

            <div className="space-y-3 mb-2">
              {/* Free */}
              <button onClick={() => finishOnboarding('free')} disabled={saving}
                className="w-full text-left p-4 rounded-xl transition-all hover:border-white/20 disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[14px] font-bold text-white">{L('Explorar Gratis', 'Explore for Free', 'Explorar Gratis')}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{L('Conhecer o sistema, comprar depois', 'Check out the system, buy later', 'Conoce el sistema, compra después')}</p>
                  </div>
                  <span className="text-[12px] font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>$0</span>
                </div>
              </button>

              {/* Leads */}
              <button onClick={() => finishOnboarding('leads')} disabled={saving}
                className="w-full text-left p-4 rounded-xl transition-all disabled:opacity-50"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white" style={{ background: '#6366f1' }}>POPULAR</span>
                    <div>
                      <p className="text-[14px] font-bold text-white">{L('Comprar 1º Pacote', 'Buy 1st Package', 'Comprar 1er Paquete')}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{L('10 leads exclusivos pra comecar a fechar', '10 exclusive leads to start closing', '10 leads exclusivos para empezar a cerrar')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[16px] font-extrabold text-white">$280</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>$28/lead</p>
                  </div>
                </div>
              </button>

              {/* CRM Pro */}
              <button onClick={() => finishOnboarding('crm')} disabled={saving}
                className="w-full text-left p-4 rounded-xl transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(99,102,241,0.2))', border: '1px solid rgba(167,139,250,0.3)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'linear-gradient(135deg, #a78bfa, #6366f1)', color: '#fff' }}>PRO</span>
                    <div>
                      <p className="text-[14px] font-bold text-white">{L('CRM Pro + Time', 'CRM Pro + Team', 'CRM Pro + Equipo')}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>{L('Pipeline, gestao de time, follow-ups, anexos', 'Pipeline, team management, follow-ups, attachments', 'Pipeline, gestión de equipo, follow-ups, archivos adjuntos')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[16px] font-extrabold text-white">$99</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{L('/mes', '/mo', '/mes')}</p>
                  </div>
                </div>
              </button>
            </div>

            <button onClick={() => setStep(3)} className="mt-4 text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {L('← Voltar', '← Back', '← Volver')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
