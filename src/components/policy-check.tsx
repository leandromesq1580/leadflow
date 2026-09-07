'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n-client'

/**
 * Caixa de ACEITE das políticas (clickwrap) — aparece nas telas de compra enquanto o
 * comprador não aceitou a versão vigente. Sem aceite, o servidor recusa o checkout
 * (HTTP 412). dark=true usa o visual do app mobile.
 */
export function PolicyCheck({ context, dark = false }: { context: string; dark?: boolean }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [state, setState] = useState<'loading' | 'needed' | 'accepted'>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/policies/accept').then(r => r.json())
      .then(d => { if (alive) setState(d.accepted ? 'accepted' : 'needed') })
      .catch(() => { if (alive) setState('needed') })
    return () => { alive = false }
  }, [])

  if (state !== 'needed') return null

  async function aceitar() {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/policies/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      })
      if (r.ok) setState('accepted')
      else alert(L('Não consegui registrar o aceite. Tente de novo.', "Couldn't record your acceptance. Please try again.", 'No pudimos registrar tu aceptación. Inténtalo de nuevo.'))
    } catch { alert(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')) }
    setBusy(false)
  }

  const ink = dark ? 'var(--m-text, #fff)' : '#1a1a2e'
  const mut = dark ? 'var(--m-muted, #94a3b8)' : '#64748b'
  return (
    <div className="rounded-xl p-4 mb-4" style={{
      background: dark ? 'rgba(124,58,237,0.10)' : 'var(--accent-light)',
      border: `1px solid ${dark ? 'rgba(124,58,237,0.35)' : 'rgba(139,92,246,0.35)'}`,
    }}>
      <p className="text-[13px] font-bold" style={{ color: ink }}>{L('📜 Aceite a Política de Leads e Uso atualizada', '📜 Accept the updated Leads & Usage Policy', '📜 Acepta la Política de Leads y Uso actualizada')}</p>
      <p className="text-[12px] mt-1" style={{ color: mut }}>
        {L('7 dias grátis para teste; pagamentos da assinatura não são reembolsáveis; renovação automática com cancelamento pela plataforma; assinatura não inclui leads; troca somente por telefone e/ou e-mail inexistente ou inválido.',
          '7-day free trial; subscription payments are non-refundable; automatic renewal with in-platform cancellation; subscription does not include leads; exchanges only for a nonexistent or invalid phone number and/or email address.',
          'Prueba gratuita de 7 días; los pagos de suscripción no son reembolsables; renovación automática con cancelación desde la plataforma; la suscripción no incluye leads; cambios solo por teléfono y/o correo inexistente o inválido.')}{' '}
        <a href="/politicas" target="_blank" rel="noopener noreferrer" className="font-bold underline" style={{ color: 'var(--accent)' }}>
          {L('Ler a política completa ↗', 'Read the full policy ↗', 'Leer la política completa ↗')}
        </a>
      </p>
      <label className="flex items-start gap-2 mt-3 cursor-pointer select-none">
        <input type="checkbox" className="mt-0.5 w-4 h-4 accent-indigo-500" checked={false} readOnly
          onClick={aceitar} disabled={busy} />
        <span className="text-[12.5px] font-semibold" style={{ color: ink }}>
          {busy ? L('Registrando aceite…', 'Recording acceptance…', 'Registrando aceptación…') : L('Li e aceito a Política de Leads e Uso da Plataforma', 'I have read and accept the Platform Leads & Usage Policy', 'He leído y acepto la Política de Leads y Uso de la Plataforma')}
        </span>
      </label>
    </div>
  )
}
