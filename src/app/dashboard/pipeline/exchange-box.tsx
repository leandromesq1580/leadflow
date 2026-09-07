'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n-client'

interface Elig {
  eligible: boolean
  reasons: string[]
  dossier: { phone: string | null; email: string | null }
  request?: { status: string } | null
}

/**
 * Caixa "Troca de lead" (aba Detalhes). O comprador declara qual dado de contato
 * não existe/é inválido. O pedido vai para conferência do admin.
 */
export function ExchangeBox({ leadId }: { leadId: string }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [e, setE] = useState<Elig | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [invalidContact, setInvalidContact] = useState<'phone' | 'email' | 'both' | ''>('')
  const [details, setDetails] = useState('')

  useEffect(() => {
    let alive = true
    fetch(`/api/leads/${leadId}/exchange`).then(r => r.json())
      .then(d => { if (alive && !d.error) setE(d) }).catch(() => {})
    return () => { alive = false }
  }, [leadId])

  if (!e) return null
  const st = e.request?.status

  async function solicitar() {
    if (busy) return
    if (!invalidContact) {
      setMsg(L('Selecione qual contato é inválido.', 'Select which contact is invalid.', 'Selecciona cuál contacto es inválido.'))
      return
    }
    if (!confirm(L('Solicitar a TROCA deste lead? Ele sai da sua conta se aprovado e você recebe 1 crédito de volta.', 'Request the EXCHANGE of this lead? If approved, it leaves your account and you get 1 credit back.', '¿Solicitar el CAMBIO de este lead? Si se aprueba, sale de tu cuenta y recibes 1 crédito de vuelta.'))) return
    setBusy(true)
    try {
      const r = await fetch(`/api/leads/${leadId}/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid_contact: invalidContact, details }),
      })
      const d = await r.json()
      if (r.ok) { setE({ ...e!, request: { status: 'pending' } }); setMsg('') }
      else setMsg(d.error || L('Não consegui solicitar.', 'Could not submit the request.', 'No pude enviar la solicitud.'))
    } catch { setMsg(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')) }
    setBusy(false)
  }

  const chip = (txt: string, color: string, bg: string) => (
    <div className="rounded-xl p-3 mt-3 text-[12px] font-semibold" style={{ background: bg, color }}>{txt}</div>
  )

  if (st === 'pending') return chip(L('🔁 Troca solicitada — aguardando análise do admin.', '🔁 Exchange requested — awaiting admin review.', '🔁 Cambio solicitado — esperando revisión del admin.'), '#92400e', 'var(--warn-line)')
  if (st === 'approved') return chip(L('✅ Troca aprovada — crédito devolvido.', '✅ Exchange approved — credit refunded.', '✅ Cambio aprobado — crédito devuelto.'), '#065f46', '#d1fae5')
  if (st === 'denied') return chip(L('❌ Pedido de troca negado pelo admin.', '❌ Exchange request denied by the admin.', '❌ Solicitud de cambio negada por el admin.'), '#991b1b', '#fee2e2')

  if (e.eligible) {
    return (
      <div className="rounded-xl p-4 mt-3" style={{ background: 'var(--accent-light)', border: '1px solid rgba(139,92,246,0.35)' }}>
        <p className="text-[13px] font-bold" style={{ color: '#5b21b6' }}>{L('🔁 Solicitar análise para troca', '🔁 Request an exchange review', '🔁 Solicitar revisión para cambio')}</p>
        <p className="text-[12px] mt-1" style={{ color: '#6d28d9' }}>
          {L('Somente telefone e/ou e-mail inexistente, inválido ou fora de serviço dá direito à troca. Falta de resposta ou interesse não se qualifica.', 'Only a nonexistent, invalid, or out-of-service phone number and/or email address qualifies. No response or lack of interest does not qualify.', 'Solo un teléfono y/o correo inexistente, inválido o fuera de servicio califica. La falta de respuesta o interés no califica.')}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {([
            ['phone', L('Telefone', 'Phone', 'Teléfono')],
            ['email', L('E-mail', 'Email', 'Correo')],
            ['both', L('Ambos', 'Both', 'Ambos')],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => { setInvalidContact(value); setMsg('') }}
              className="rounded-lg px-3 py-2 text-[12px] font-bold"
              style={{ background: invalidContact === value ? 'var(--accent)' : '#fff', color: invalidContact === value ? '#fff' : '#5b21b6', border: '1px solid rgba(139,92,246,.35)' }}>
              {label}
            </button>
          ))}
        </div>
        <textarea value={details} onChange={event => setDetails(event.target.value)} maxLength={500}
          placeholder={L('Detalhes para a verificação (opcional)', 'Details for verification (optional)', 'Detalles para la verificación (opcional)')}
          className="mt-3 min-h-20 w-full rounded-lg p-3 text-[12px] outline-none" style={{ background: '#fff', color: '#1e293b', border: '1px solid rgba(139,92,246,.3)' }} />
        <button onClick={solicitar} disabled={busy}
          className="mt-3 px-4 py-2 rounded-lg text-[12px] font-bold text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}>
          {busy ? L('Enviando…', 'Sending…', 'Enviando…') : L('Solicitar troca (+1 crédito se aprovada)', 'Request exchange (+1 credit if approved)', 'Solicitar cambio (+1 crédito si se aprueba)')}
        </button>
        {msg && <p className="text-[12px] mt-2" style={{ color: '#dc2626' }}>{msg}</p>}
      </div>
    )
  }
  return null // não elegível e sem pedido: não polui a tela
}
