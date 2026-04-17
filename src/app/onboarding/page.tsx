'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]

const DAY_TYPES = [
  { key: 'weekday', label: 'Seg-Sex' },
  { key: 'saturday', label: 'Sabado' },
  { key: 'sunday', label: 'Domingo' },
]

const PERIODS = [
  { key: 'morning', label: 'Manha' },
  { key: 'afternoon', label: 'Tarde' },
  { key: 'evening', label: 'Noite' },
]

const TOTAL_STEPS = 5

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [states, setStates] = useState<string[]>([])
  const [avail, setAvail] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

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
      const token = JSON.parse(atob(cookie.split('=')[1]))
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
      const r = await fetch('/api/checkout/subscription', { method: 'POST' })
      const d = await r.json()
      if (d.url) window.location.href = d.url
      else window.location.href = '/dashboard/credits'
    }
  }

  async function nextStep() {
    if (step === 3) {
      // Save states + availability before showing plan
      await saveSettings()
    }
    setStep(s => Math.min(TOTAL_STEPS, s + 1))
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'linear-gradient(160deg, #0f0a2e 0%, #1e1b4b 50%, #312e81 100%)' }}>
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-black mx-auto mb-3" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>L</div>
          <h1 className="text-[22px] sm:text-[26px] font-extrabold text-white">Bem-vindo ao Lead4Producers</h1>
          <p className="text-[13px] sm:text-[14px] mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Vamos configurar sua conta — leva menos de 2 minutos</p>
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
              <h2 className="text-[20px] font-bold text-white mb-2">Como funciona em 3 passos</h2>
              <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Veja como Lead4Producers vai funcionar pra voce</p>
            </div>

            <div className="space-y-3 mb-6">
              {[
                { icon: '⚙️', title: 'Configure sua conta', desc: 'Estados onde tem licenca + horarios disponiveis' },
                { icon: '💳', title: 'Compre leads ou assine o CRM', desc: 'Pacote de leads ($22/un) ou CRM Pro ($99/mes) com pipeline e gestao de time' },
                { icon: '🚀', title: 'Receba leads no WhatsApp', desc: 'Em tempo real. Voce so liga e fecha. Pipeline organiza tudo.' },
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
              Vamos comecar →
            </button>
          </div>
        )}

        {/* Step 2 — States */}
        {step === 2 && (
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[24px]">📍</span>
              <h2 className="text-[18px] font-bold text-white">Seus estados</h2>
            </div>
            <p className="text-[13px] mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>Selecione os estados onde voce tem licenca pra vender seguro. Voce so recebera leads desses estados.</p>
            <div className="flex flex-wrap gap-2 mb-6 max-h-[280px] overflow-y-auto">
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
              <p className="text-[12px] mb-4" style={{ color: '#a78bfa' }}>{states.length} estado{states.length > 1 ? 's' : ''} selecionado{states.length > 1 ? 's' : ''}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="px-6 py-3.5 rounded-xl font-bold text-[14px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                ← Voltar
              </button>
              <button onClick={() => setStep(3)} disabled={states.length === 0}
                className="flex-1 py-3.5 rounded-xl font-bold text-[14px] text-white disabled:opacity-30"
                style={{ background: '#6366f1' }}>
                Proximo →
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Availability */}
        {step === 3 && (
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[24px]">📅</span>
              <h2 className="text-[18px] font-bold text-white">Disponibilidade</h2>
            </div>
            <p className="text-[13px] mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>Quando voce pode atender? (Opcional — pode pular se quiser so leads)</p>
            <div className="space-y-4 mb-6">
              {DAY_TYPES.map(day => (
                <div key={day.key}>
                  <p className="text-[13px] font-bold text-white mb-2">{day.label}</p>
                  <div className="flex gap-2">
                    {PERIODS.map(period => {
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
                ← Voltar
              </button>
              <button onClick={nextStep}
                className="flex-1 py-3.5 rounded-xl font-bold text-[14px] text-white"
                style={{ background: '#6366f1' }}>
                Proximo →
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Plan */}
        {step === 4 && (
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-center mb-6">
              <span className="text-[32px] block mb-2">🚀</span>
              <h2 className="text-[20px] font-bold text-white">Como quer comecar?</h2>
              <p className="text-[13px] mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Escolha o melhor plano. Pode mudar depois.</p>
            </div>

            <div className="space-y-3 mb-2">
              {/* Free */}
              <button onClick={() => finishOnboarding('free')} disabled={saving}
                className="w-full text-left p-4 rounded-xl transition-all hover:border-white/20 disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[14px] font-bold text-white">Explorar Gratis</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Conhecer o sistema, comprar depois</p>
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
                      <p className="text-[14px] font-bold text-white">Comprar 1º Pacote</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>10 leads exclusivos pra comecar a fechar</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[16px] font-extrabold text-white">$220</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>$22/lead</p>
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
                      <p className="text-[14px] font-bold text-white">CRM Pro + Time</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Pipeline, gestao de time, follow-ups, anexos</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[16px] font-extrabold text-white">$99</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>/mes</p>
                  </div>
                </div>
              </button>
            </div>

            <button onClick={() => setStep(3)} className="mt-4 text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>
              ← Voltar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
