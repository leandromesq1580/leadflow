'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/lib/i18n-client'

type Recipient = { id: string; name: string; email: string; remaining: number; eligible: boolean; reason?: string }
type Lead = { id: string; name: string; language: string }
type Attempt = { request_id: string; lead_id: string; recipient: Recipient; lead: Lead }
type Delivered = { assigned_at: string; notifications_pending?: boolean }
const ENDPOINT = '/api/admin/leads/assign-as-new'

export function AssignLeadAsNewDialog({ leadId, onClose, onDone }: { leadId: string; onClose: () => void; onDone: () => void }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const recipientReason = (reason?: string) => reason === 'no_credit'
    ? L('Sem crédito válido no idioma deste lead.', 'No valid credit in this lead’s language.', 'Sin crédito válido en el idioma de este lead.')
    : reason === 'pipeline_unavailable'
      ? L('Precisa configurar um funil padrão com etapa inicial.', 'Needs a default pipeline with a first stage.', 'Necesita un embudo predeterminado con etapa inicial.')
      : reason === 'buyer_unavailable'
        ? L('Cliente inativo.', 'Inactive customer.', 'Cliente inactivo.')
        : L('Indisponível para esta entrega.', 'Unavailable for this delivery.', 'No disponible para esta entrega.')
  const [lead, setLead] = useState<Lead | null>(null)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [selected, setSelected] = useState<Recipient | null>(null)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [delivered, setDelivered] = useState<Delivered | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const sending = useRef(false)
  const generation = useRef(0)
  const currentAttempt = useRef<Attempt | null>(null)
  const storageKey = `l4p-new-delivery:${leadId}`

  // Keep the operation identity across closing/reopening after a lost response.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as Attempt | null
      if (saved?.lead_id === leadId && saved.request_id && saved.recipient?.id && saved.lead?.id === leadId) {
        currentAttempt.current = saved
        setAttempt(saved); setSelected(saved.recipient); setLead(saved.lead); setRecipients([saved.recipient]); setLoading(false)
      }
    } catch { /* The database also prevents duplicate delivery by source lead. */ }
    dialog.current?.showModal()
  }, [leadId, storageKey])

  const load = useCallback(async (search: string, after: string | null = null) => {
    if (currentAttempt.current) return
    const version = ++generation.current
    setLoading(true); setLoadError('')
    if (!after) { setRecipients([]); setSelected(null); setCursor(null) }
    try {
      const params = new URLSearchParams({ lead_id: leadId, q: search })
      if (after) params.set('cursor', after)
      const response = await fetch(`${ENDPOINT}?${params}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.lead || !Array.isArray(data.buyers)) throw new Error(data.error || 'Não foi possível consultar os clientes.')
      if (generation.current !== version || currentAttempt.current) return
      setLead(data.lead)
      setRecipients(previous => after ? [...new Map([...previous, ...data.buyers].map(r => [r.id, r])).values()] : data.buyers)
      setCursor(data.next_cursor || null)
    } catch (e) {
      if (generation.current === version && !currentAttempt.current) setLoadError(e instanceof Error ? e.message : 'Não foi possível consultar os clientes.')
    } finally {
      if (generation.current === version) setLoading(false)
    }
  }, [leadId])

  const invalidate = useCallback(() => { generation.current++ }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(query) }, 180)
    return () => { window.clearTimeout(timer); invalidate() }
  }, [query, load, invalidate])

  function clearAttempt() {
    currentAttempt.current = null; setAttempt(null)
    try { sessionStorage.removeItem(storageKey) } catch { /* best effort */ }
  }

  async function submit() {
    if (sending.current || !selected || !lead || delivered) return
    sending.current = true; setSaving(true); setError('')
    const operation = currentAttempt.current || { request_id: crypto.randomUUID(), lead_id: leadId, recipient: selected, lead }
    currentAttempt.current = operation; setAttempt(operation)
    try { sessionStorage.setItem(storageKey, JSON.stringify(operation)) } catch { /* source uniqueness remains enforced server-side */ }
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: operation.lead_id, to_buyer_id: operation.recipient.id, request_id: operation.request_id }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || data?.success !== true) {
        // A server timeout may happen after the debit committed. Never choose a new
        // recipient or operation ID until retrying this SAME request establishes the result.
        if (response.status >= 400 && response.status < 500 && data?.code !== 'UNKNOWN_RESULT') clearAttempt()
        setError(data?.error || L('Não foi possível confirmar a entrega. Confira antes de tentar outra atribuição.', 'Delivery could not be confirmed. Check before assigning again.', 'No se pudo confirmar la entrega. Verifica antes de asignar de nuevo.'))
        return
      }
      setDelivered({ assigned_at: data.assigned_at, notifications_pending: data.notifications_pending })
      clearAttempt()
    } catch {
      setError(L('A conexão caiu e a entrega pode ter sido concluída. Confira a mesma entrega; não haverá um segundo desconto.', 'The connection was lost and delivery may have completed. Check the same delivery; there will be no second debit.', 'Se perdió la conexión y la entrega puede haberse completado. Verifica la misma entrega; no habrá un segundo descuento.'))
    } finally { sending.current = false; setSaving(false) }
  }

  const frozen = saving || !!attempt || !!delivered
  const date = delivered?.assigned_at ? new Intl.DateTimeFormat(t._locale === 'pt' ? 'pt-BR' : t._locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/New_York', hour12: true }).format(new Date(delivered.assigned_at)) : ''
  const close = () => {
    if (sending.current) return
    if (delivered) onDone()
    onClose()
  }
  return createPortal(
    <dialog ref={dialog} aria-labelledby="assign-new-title" aria-describedby="assign-new-description"
      onCancel={e => { e.preventDefault(); close() }} onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
      className="m-auto max-w-lg max-h-[calc(100dvh-2rem)] rounded-2xl p-0 backdrop:bg-slate-950/40 shadow-2xl"
      style={{ background: 'var(--bg-card)', color: 'var(--fg)', border: '1px solid var(--border)', width: 'calc(100% - 2rem)' }}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 id="assign-new-title" className="text-lg font-bold">{L('Atribuir lead como novo', 'Assign lead as new', 'Asignar lead como nuevo')}</h2>
          <button type="button" disabled={saving} onClick={close} aria-label={L('Fechar', 'Close', 'Cerrar')} className="rounded-lg px-2 text-xl leading-6 disabled:opacity-40">×</button>
        </div>
        <p id="assign-new-description" className="text-sm mb-4" style={{ color: 'var(--fg-secondary)' }}>
          {L('Nova data de recebimento, novo atendimento e desconto de 1 crédito do destinatário. O crédito anterior não é devolvido.', 'New received date, fresh service history and 1 recipient credit deducted. The previous credit is not refunded.', 'Nueva fecha de recepción, atención nueva y descuento de 1 crédito al destinatario. No se devuelve el crédito anterior.')}
        </p>
        {lead && <p className="mb-4 text-sm font-semibold truncate">{lead.name} <span className="font-normal" style={{ color: 'var(--fg-muted)' }}>· {lead.language.toUpperCase()}</span></p>}
        {delivered ? (
          <div role="status" className="space-y-3">
            <p className="font-semibold text-emerald-700">{L('Lead entregue como novo.', 'Lead delivered as new.', 'Lead entregado como nuevo.')}</p>
            <p className="text-sm">{selected?.name} · {date} {L('(Flórida)', '(Florida)', '(Florida)')}</p>
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>{delivered.notifications_pending
              ? L('O aviso ao destinatário está pendente. Não repita a entrega.', 'The recipient notification is pending. Do not repeat the delivery.', 'El aviso al destinatario está pendiente. No repitas la entrega.')
              : L('A entrega foi registrada com 1 crédito descontado.', 'Delivery was recorded with 1 credit deducted.', 'La entrega se registró con 1 crédito descontado.')}</p>
            <button type="button" onClick={close} className="w-full rounded-xl px-4 py-3 font-semibold text-white" style={{ background: 'var(--accent)' }}>{L('Concluir', 'Done', 'Concluir')}</button>
          </div>
        ) : (
          <>
            <label htmlFor="new-lead-search" className="block text-xs font-semibold mb-1">{L('Buscar cliente', 'Find customer', 'Buscar cliente')}</label>
            <input id="new-lead-search" autoFocus type="search" value={query} disabled={frozen}
              onChange={e => { setQuery(e.target.value); setSelected(null); setError(''); setLoading(true); generation.current++ }}
              placeholder={L('Nome ou e-mail', 'Name or email', 'Nombre o correo')}
              className="w-full rounded-xl border px-3 py-2.5 text-sm mb-3 disabled:opacity-60" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            {loadError && !attempt && <div role="alert" className="mb-3 text-sm text-red-700">{loadError} <button type="button" onClick={() => { void load(query) }} className="underline font-semibold">{L('Tentar novamente', 'Try again', 'Intentar de nuevo')}</button></div>}
            <div aria-label={L('Clientes', 'Customers', 'Clientes')} className="space-y-1 max-h-[32dvh] overflow-y-auto">
              {recipients.map(recipient => <button key={recipient.id} type="button" disabled={!recipient.eligible || frozen}
                aria-pressed={selected?.id === recipient.id} onClick={() => { setSelected(recipient); setError('') }}
                className="w-full text-left rounded-xl border p-3 disabled:opacity-70"
                style={{ borderColor: selected?.id === recipient.id ? 'var(--accent)' : 'transparent', background: selected?.id === recipient.id ? 'var(--bg-soft)' : 'transparent' }}>
                <span className="flex justify-between gap-2 text-sm font-semibold"><span className="truncate">{recipient.name}</span><span className="whitespace-nowrap text-xs">{recipient.remaining} {L('créditos', 'credits', 'créditos')}</span></span>
                <span className="block text-xs truncate mt-0.5" style={{ color: 'var(--fg-secondary)' }}>{recipient.email}</span>
                {!recipient.eligible && <span className="block text-xs mt-1 text-amber-700">{recipientReason(recipient.reason)}</span>}
              </button>)}
              {loading && !attempt && <p role="status" className="p-3 text-sm">{L('Buscando clientes…', 'Finding customers…', 'Buscando clientes…')}</p>}
              {!loading && !loadError && !recipients.length && <p className="p-3 text-sm">{L('Nenhum cliente encontrado.', 'No customers found.', 'No se encontraron clientes.')}</p>}
              {cursor && !attempt && <button type="button" disabled={loading || saving} onClick={() => { void load(query, cursor) }} className="w-full p-2 text-sm font-semibold disabled:opacity-50">{L('Carregar mais', 'Load more', 'Cargar más')}</button>}
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              {selected && <p className="text-xs mb-3" style={{ color: 'var(--fg-muted)' }}>{L('Destinatário:', 'Recipient:', 'Destinatario:')} <strong>{selected.name}</strong> · {L('1 crédito', '1 credit', '1 crédito')} {lead?.language.toUpperCase()}</p>}
              <button type="button" disabled={saving || !selected || (!attempt && (loading || !!loadError))} onClick={() => { void submit() }}
                className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>
                {saving ? L('Confirmando…', 'Confirming…', 'Confirmando…') : attempt ? L('Conferir entrega', 'Check delivery', 'Verificar entrega') : L('Entregar e descontar 1 crédito', 'Deliver and deduct 1 credit', 'Entregar y descontar 1 crédito')}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>, document.body,
  )
}
