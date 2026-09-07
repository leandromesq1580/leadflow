'use client'

import { useState } from 'react'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { useLocale } from '@/lib/i18n-client'

type Copy = {
  eyebrow: string
  title: string
  intro: string
  items: string[]
  link: string
  checkbox: string
  button: string
  saving: string
  error: string
}

const COPY: Record<'pt' | 'en' | 'es', Copy> = {
  pt: {
    eyebrow: 'ATUALIZAÇÃO OBRIGATÓRIA',
    title: 'Política de Leads e Uso',
    intro: 'Para continuar usando o Lead4Pro, leia e aceite a versão atualizada da política:',
    items: [
      'A plataforma oferece 7 dias grátis para teste. Depois de realizada uma assinatura paga, não há reembolso, salvo quando exigido pela legislação aplicável.',
      'A assinatura renova automaticamente. Para impedir a próxima renovação, cancele pela própria plataforma antes da cobrança.',
      'A assinatura do sistema não inclui nem entrega leads. Pacotes de leads são adquiridos separadamente.',
      'A troca de lead só pode ser solicitada quando o telefone e/ou o e-mail informado não existe ou é inválido. Falta de resposta não dá direito à troca.',
    ],
    link: 'Ler a política completa',
    checkbox: 'Li e aceito a Política de Leads e Uso da Plataforma.',
    button: 'Aceitar e continuar',
    saving: 'Registrando aceite…',
    error: 'Não foi possível registrar seu aceite. Verifique a conexão e tente novamente.',
  },
  en: {
    eyebrow: 'REQUIRED UPDATE',
    title: 'Leads & Platform Usage Policy',
    intro: 'To continue using Lead4Pro, read and accept the updated policy:',
    items: [
      'The platform includes a 7-day free trial. Once a paid subscription is purchased, payments are non-refundable, except where required by applicable law.',
      'Subscriptions renew automatically. To prevent the next renewal, cancel through the platform before the charge date.',
      'The platform subscription does not include or deliver leads. Lead packages are purchased separately.',
      'A lead exchange may only be requested when the provided phone number and/or email address does not exist or is invalid. No response does not qualify for an exchange.',
    ],
    link: 'Read the full policy',
    checkbox: 'I have read and accept the Platform Leads & Usage Policy.',
    button: 'Accept and continue',
    saving: 'Recording acceptance…',
    error: 'We could not record your acceptance. Check your connection and try again.',
  },
  es: {
    eyebrow: 'ACTUALIZACIÓN OBLIGATORIA',
    title: 'Política de Leads y Uso de la Plataforma',
    intro: 'Para continuar usando Lead4Pro, lee y acepta la política actualizada:',
    items: [
      'La plataforma incluye una prueba gratuita de 7 días. Una vez contratada una suscripción pagada, los pagos no son reembolsables, salvo cuando la ley aplicable exija lo contrario.',
      'Las suscripciones se renuevan automáticamente. Para impedir la próxima renovación, cancela desde la plataforma antes de la fecha de cobro.',
      'La suscripción de la plataforma no incluye ni entrega leads. Los paquetes de leads se compran por separado.',
      'Solo se puede solicitar el cambio de un lead cuando el teléfono y/o el correo informado no existe o es inválido. La falta de respuesta no da derecho al cambio.',
    ],
    link: 'Leer la política completa',
    checkbox: 'He leído y acepto la Política de Leads y Uso de la Plataforma.',
    button: 'Aceptar y continuar',
    saving: 'Registrando aceptación…',
    error: 'No pudimos registrar tu aceptación. Revisa la conexión e inténtalo de nuevo.',
  },
}

export function PolicyAcceptanceGate({ context }: { context: string }) {
  const locale = useLocale()
  const copy = COPY[locale]
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function accept() {
    if (!checked || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/policies/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      })
      if (!response.ok) throw new Error('acceptance_failed')
      window.location.reload()
    } catch {
      setError(copy.error)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] overflow-y-auto px-4 py-8 sm:py-12" style={{ background: 'rgba(15, 23, 42, 0.82)', backdropFilter: 'blur(10px)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="policy-title" className="mx-auto max-w-2xl rounded-3xl p-6 sm:p-8" style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e2e8f0)', boxShadow: '0 24px 80px rgba(15,23,42,.35)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-extrabold tracking-[0.14em]" style={{ color: 'var(--accent, #7c3aed)' }}>{copy.eyebrow}</p>
            <h1 id="policy-title" className="mt-1 text-[24px] font-extrabold sm:text-[28px]" style={{ color: 'var(--fg, #0f172a)' }}>{copy.title}</h1>
          </div>
          <LocaleSwitcher current={locale} variant="topbar" />
        </div>

        <p className="mt-4 text-[14px] leading-relaxed" style={{ color: 'var(--fg-secondary, #475569)' }}>{copy.intro}</p>
        <ul className="mt-5 space-y-3">
          {copy.items.map((item) => (
            <li key={item} className="flex gap-3 rounded-xl p-3 text-[13px] leading-relaxed" style={{ background: 'var(--bg-soft, #f8fafc)', color: 'var(--fg-secondary, #334155)' }}>
              <span aria-hidden="true" className="font-black" style={{ color: 'var(--accent, #7c3aed)' }}>✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <a href="/politicas" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex text-[13px] font-bold underline" style={{ color: 'var(--accent, #7c3aed)' }}>
          {copy.link} ↗
        </a>

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl p-4" style={{ border: '1px solid var(--border, #e2e8f0)', color: 'var(--fg, #0f172a)' }}>
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-0.5 h-5 w-5 accent-violet-600" />
          <span className="text-[13px] font-bold leading-relaxed">{copy.checkbox}</span>
        </label>

        {error && <p role="alert" className="mt-3 rounded-xl p-3 text-[12px] font-semibold" style={{ background: '#fef2f2', color: '#b91c1c' }}>{error}</p>}

        <button type="button" onClick={accept} disabled={!checked || busy} className="mt-4 w-full rounded-xl py-3.5 text-[14px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40" style={{ background: 'var(--accent, #7c3aed)' }}>
          {busy ? copy.saving : copy.button}
        </button>
      </div>
    </div>
  )
}
