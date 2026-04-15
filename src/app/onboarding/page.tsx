'use client'

import { useState } from 'react'
import Link from 'next/link'

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
  { key: 'morning', label: 'Manha (8h-12h)' },
  { key: 'afternoon', label: 'Tarde (12h-18h)' },
  { key: 'evening', label: 'Noite (18h-21h)' },
]

export default function OnboardingPage() {
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

  async function saveAndFinish() {
    setSaving(true)

    // Get buyer_id from cookie/session
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    let buyerId = ''

    if (cookie) {
      try {
        const token = JSON.parse(atob(cookie.split('=')[1]))
        const payload = JSON.parse(atob(token.access_token.split('.')[1]))
        // Fetch buyer_id from API
        const resp = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auth_user_id: payload.sub,
            states,
            availability: avail.map(a => {
              const [day_type, period] = a.split('_')
              return { day_type, period }
            }),
          }),
        })
      } catch {}
    }

    // Redirect to credits page to buy first package
    window.location.href = '/dashboard/credits'
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: 'linear-gradient(160deg, #0f0a2e 0%, #1e1b4b 50%, #312e81 100%)' }}>
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-black mx-auto mb-3" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>L</div>
          <h1 className="text-[22px] sm:text-[26px] font-extrabold text-white">Bem-vindo ao LeadFlow!</h1>
          <p className="text-[13px] sm:text-[14px] mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Vamos configurar sua conta em 3 passos rapidos</p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex-1 h-1.5 rounded-full" style={{ background: s <= step ? '#6366f1' : 'rgba(255,255,255,0.1)' }} />
          ))}
        </div>

        {/* Step 1 - States */}
        {step === 1 && (
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[24px]">📍</span>
              <h2 className="text-[18px] font-bold text-white">Passo 1: Seus Estados</h2>
            </div>
            <p className="text-[13px] mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>Selecione os estados onde voce tem licenca pra vender seguro. Voce so recebera leads desses estados.</p>
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
              <p className="text-[12px] mb-4" style={{ color: '#a78bfa' }}>{states.length} estado{states.length > 1 ? 's' : ''} selecionado{states.length > 1 ? 's' : ''}</p>
            )}
            <button onClick={() => setStep(2)} disabled={states.length === 0}
              className="w-full py-4 rounded-xl font-bold text-[14px] text-white disabled:opacity-30"
              style={{ background: '#6366f1' }}>
              Proximo →
            </button>
          </div>
        )}

        {/* Step 2 - Availability */}
        {step === 2 && (
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[24px]">📅</span>
              <h2 className="text-[18px] font-bold text-white">Passo 2: Disponibilidade</h2>
            </div>
            <p className="text-[13px] mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>Quando voce pode receber appointments? (Opcional — pode pular se quiser so leads)</p>
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
              <button onClick={() => setStep(1)} className="px-6 py-4 rounded-xl font-bold text-[14px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                ← Voltar
              </button>
              <button onClick={() => setStep(3)} className="flex-1 py-4 rounded-xl font-bold text-[14px] text-white" style={{ background: '#6366f1' }}>
                Proximo →
              </button>
            </div>
          </div>
        )}

        {/* Step 3 - Summary & Go */}
        {step === 3 && (
          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[24px]">🚀</span>
              <h2 className="text-[18px] font-bold text-white">Passo 3: Tudo Pronto!</h2>
            </div>
            <p className="text-[13px] mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>Confira suas configuracoes e compre seu primeiro pacote de leads.</p>

            {/* Summary */}
            <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Estados</p>
              <div className="flex flex-wrap gap-1.5">
                {states.map(s => (
                  <span key={s} className="px-2 py-0.5 rounded text-[11px] font-bold text-white" style={{ background: '#6366f1' }}>{s}</span>
                ))}
              </div>
            </div>
            {avail.length > 0 && (
              <div className="rounded-xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Disponibilidade</p>
                <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{avail.length} slots configurados</p>
              </div>
            )}

            <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <p className="text-[13px] font-semibold" style={{ color: '#fbbf24' }}>💡 Proximo passo: comprar seu primeiro pacote de leads pra comecar a receber clientes!</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="px-6 py-4 rounded-xl font-bold text-[14px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                ← Voltar
              </button>
              <button onClick={saveAndFinish} disabled={saving}
                className="flex-1 py-4 rounded-xl font-bold text-[14px] text-center disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #eab308)', color: '#1a1a2e' }}>
                {saving ? 'Salvando...' : 'Salvar e Comprar Creditos →'}
              </button>
            </div>
          </div>
        )}

        {/* Skip */}
        <p className="text-center mt-6">
          <Link href="/dashboard" className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Pular e ir pro dashboard →
          </Link>
        </p>
      </div>
    </div>
  )
}
