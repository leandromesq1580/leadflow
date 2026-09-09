'use client'

import { useId, useRef, useState } from 'react'
import { useT } from '@/lib/i18n-client'
import { usePrivacy } from '@/lib/privacy-mode'
import type { EmailResult } from '@/lib/manual-email'

type Lead = { id: string; name: string; email?: string | null }
type Preview = {
  previewHash: string; subject: string; body: string; footer: string; from: string
  recipients: { leadId: string; name: string; email: string | null; status: string; reason?: string }[]
}

export function ManualEmailComposer({ leads }: { leads: Lead[] }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const privacy = usePrivacy()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<EmailResult[] | null>(null)
  const requestId = useRef<string | null>(null)
  const inFlight = useRef(false)
  const selectedIds = leads.filter(l => selected.includes(l.id)).map(l => l.id)
  const editable = !busy && !attempted
  const inputClass = 'w-full rounded-lg border p-2 text-sm bg-transparent'
  const buttonClass = 'rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50'

  function invalidatePreview() { setPreview(null); setConsent(false); setError('') }

  async function submit(isPreview: boolean) {
    if (inFlight.current || (!isPreview && (!preview || !consent || results))) return
    inFlight.current = true
    setBusy(true)
    setError('')
    requestId.current ||= crypto.randomUUID()
    if (!isPreview) setAttempted(true)
    try {
      const response = await fetch('/api/leads/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(190000),
        body: JSON.stringify({ leadIds: isPreview ? selectedIds : preview!.recipients.map(r => r.leadId),
          subject, body, requestId: requestId.current, preview: isPreview,
          previewHash: preview?.previewHash, confirmed: !isPreview, consentConfirmed: consent }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || L('Não foi possível confirmar o resultado.', 'Could not confirm the result.', 'No se pudo confirmar el resultado.'))
      if (isPreview) { setPreview(data); setConsent(false) }
      else setResults(data.results)
    } catch (e) {
      setError(isPreview && e instanceof Error ? e.message : L(
        'Resultado não confirmado. Consulte novamente com o mesmo identificador; não crie outro envio.',
        'Result not confirmed. Check again with the same request ID; do not create another send.',
        'Resultado no confirmado. Consulta con el mismo identificador; no crees otro envío.',
      ) + (e instanceof Error && e.message ? ` ${e.message}` : ''))
    } finally { inFlight.current = false; setBusy(false) }
  }

  function reset() {
    setSelected([]); setSubject(''); setBody(''); setPreview(null); setConsent(false)
    setResults(null); setAttempted(false); setError(''); requestId.current = null
  }

  const labelStatus = (status: string, reason?: string) => {
    if (status === 'accepted') return L('Aceito pelo provedor', 'Accepted by provider', 'Aceptado por el proveedor')
    if (status === 'failed') return L('Recusado pelo provedor', 'Rejected by provider', 'Rechazado por el proveedor')
    if (status === 'unknown') return L('Resultado incerto — não reenvie', 'Unknown outcome — do not resend', 'Resultado incierto — no reenvíes')
    if (status === 'ready') return L('Pronto para enviar', 'Ready to send', 'Listo para enviar')
    if (reason === 'descadastrado') return L('Descadastrado', 'Unsubscribed', 'Suscripción cancelada')
    if (reason === 'email_duplicado') return L('Email duplicado — ignorado', 'Duplicate email — skipped', 'Email duplicado — omitido')
    if (reason === 'email_invalido') return L('Sem email válido', 'No valid email', 'Sin email válido')
    return L('Cadastro alterado — ignorado', 'Changed lead — skipped', 'Lead modificado — omitido')
  }

  return <section className="mb-4 rounded-xl border p-4" style={{ background: 'var(--bg-card)', color: 'var(--fg)', borderColor: 'var(--border)' }}>
    <button type="button" className={buttonClass} data-action="open-email" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(!open)}>
      {L('Enviar email aos meus leads', 'Email my leads', 'Enviar email a mis leads')}
    </button>
    {open && <div id={`${id}-panel`} className="mt-4 space-y-4">
      <p className="text-sm">{L('Envios individuais, apenas para seus leads. Máximo: 20 por lote/minuto e 100 em 24h. Mensagens idênticas não são reenviadas por 24h.', 'Individual emails to your own leads only. Maximum: 20 per batch/minute and 100 per 24h. Identical messages are not resent for 24h.', 'Emails individuales solo a tus leads. Máximo: 20 por lote/minuto y 100 por 24h. Mensajes idénticos no se reenvían durante 24h.')}</p>
      <fieldset disabled={!editable} className="space-y-2">
        <legend className="font-semibold">{L('Selecionar destinatários da busca atual', 'Select recipients from current search', 'Seleccionar destinatarios de la búsqueda actual')} ({selectedIds.length}/20)</legend>
        <div className="flex gap-2">
          <button type="button" className={buttonClass} onClick={() => { setSelected(leads.filter(l => l.email).slice(0, 20).map(l => l.id)); invalidatePreview() }}>{L('Selecionar até 20', 'Select up to 20', 'Seleccionar hasta 20')}</button>
          <button type="button" className={buttonClass} onClick={() => { setSelected([]); invalidatePreview() }}>{L('Limpar seleção', 'Clear selection', 'Limpiar selección')}</button>
        </div>
        <div className="max-h-48 overflow-auto space-y-2">
          {leads.map(lead => <label key={lead.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" data-lead-id={lead.id} checked={selected.includes(lead.id)} disabled={!lead.email || (!selected.includes(lead.id) && selectedIds.length >= 20)}
              onChange={e => { setSelected(e.target.checked ? [...selected, lead.id] : selected.filter(value => value !== lead.id)); invalidatePreview() }} />
            {lead.name}{!lead.email && ` — ${L('sem email', 'no email', 'sin email')}`}
          </label>)}
        </div>
      </fieldset>
      <label className="block text-sm" htmlFor={`${id}-subject`}>{L('Assunto', 'Subject', 'Asunto')} ({subject.length}/200)</label>
      <input id={`${id}-subject`} name="subject" className={inputClass} value={subject} disabled={!editable} maxLength={200} required onChange={e => { setSubject(e.target.value); invalidatePreview() }} />
      <label className="block text-sm" htmlFor={`${id}-body`}>{L('Mensagem (texto simples)', 'Message (plain text)', 'Mensaje (texto simple)')} ({body.length}/10000)</label>
      <textarea id={`${id}-body`} name="body" className={inputClass} rows={6} value={body} disabled={!editable} maxLength={10000} required onChange={e => { setBody(e.target.value); invalidatePreview() }} />
      <button type="button" data-action="preview" className={buttonClass} disabled={!editable || !selectedIds.length || !subject.trim() || !body.trim()} onClick={() => submit(true)}>{L('Ver prévia', 'Preview', 'Ver vista previa')}</button>
      {preview && <div className="rounded-lg border p-3 space-y-3" aria-label={L('Prévia do email', 'Email preview', 'Vista previa del email')}>
        <p className="text-sm">{L('Remetente', 'From', 'Remitente')}: {preview.from}</p>
        <ul className="text-sm space-y-1">{preview.recipients.map(r => <li key={r.leadId}>{r.name} — {privacy.mask(r.email, 'email')} — {labelStatus(r.status, r.reason)}</li>)}</ul>
        <h3 className="font-semibold">{preview.subject}</h3>
        <p className="whitespace-pre-wrap break-words text-sm">{preview.body}</p>
        <p className="whitespace-pre-wrap break-words text-xs">{preview.footer}</p>
        <label className="flex items-start gap-2 text-sm"><input name="consent" type="checkbox" checked={consent} disabled={busy || attempted} onChange={e => setConsent(e.target.checked)} />
          {L('Revisei os destinatários e o conteúdo. Confirmo que tenho autorização/base legal para este contato e que respeitei pedidos de descadastro.', 'I reviewed the recipients and content. I confirm authorization/legal basis for this contact and have honored opt-outs.', 'Revisé los destinatarios y el contenido. Confirmo autorización/base legal para este contacto y respeto las bajas.')}
        </label>
        <button type="button" data-action="send" className={buttonClass} disabled={busy || !consent || !!results || !preview.recipients.some(r => r.status === 'ready')} onClick={() => submit(false)}>
          {busy ? L('Aguarde…', 'Please wait…', 'Espera…') : attempted ? L('Consultar com o mesmo identificador', 'Check with same request ID', 'Consultar con el mismo identificador') : L('Confirmar e enviar', 'Confirm and send', 'Confirmar y enviar')}
        </button>
        <p className="text-xs break-all">{L('Identificador', 'Request ID', 'Identificador')}: {requestId.current}</p>
      </div>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {results && <div role="status" className="text-sm space-y-2">
        <p>{L('Aceite pelo provedor não confirma entrega na caixa de entrada.', 'Provider acceptance does not confirm inbox delivery.', 'La aceptación del proveedor no confirma entrega en la bandeja de entrada.')}</p>
        <ul>{results.map(r => <li key={r.leadId}>{preview?.recipients.find(p => p.leadId === r.leadId)?.name || r.leadId}: {labelStatus(r.status, r.reason)}</li>)}</ul>
        {!results.some(r => r.status === 'unknown') && <button type="button" className={buttonClass} onClick={reset}>{L('Nova mensagem', 'New message', 'Nuevo mensaje')}</button>}
      </div>}
    </div>}
  </section>
}
