import { createHash } from 'node:crypto'

export function normalizeEmail(value: string | null): string | null {
  const email = value?.trim().toLowerCase()
  return email && email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email) ? email : null
}

export type OwnedLead = { id: string; assigned_to: string | null; name: string; email: string | null }
export type EmailResult = { leadId: string; status: 'accepted' | 'failed' | 'unknown' | 'skipped'; reason?: string }
export type EmailPreference = { email?: string; token: string; suppressed_at: string | null }
export type EmailConfig = { from: string; postalAddress: string; origin: string }
export type EmailMessage = { from: string; to: string; subject: string; text: string; headers: Record<string, string> }
export type Reservation = { limited?: boolean; id: string; fresh: boolean; payload_hash: string; status: string; results: EmailResult[] }
export type EmailDependencies = {
  actor(): Promise<{ id: string } | null>
  ownedLeads(buyerId: string, ids: string[]): Promise<OwnedLead[]>
  preferences(buyerId: string, emails: string[]): Promise<EmailPreference[]>
  config(): EmailConfig
  reserve(buyerId: string, requestId: string, hash: string, count: number): Promise<Reservation>
  preference(buyerId: string, email: string): Promise<EmailPreference>
  send(message: EmailMessage, key: string): Promise<{ data: { id: string } | null; error: unknown }>
  finish(batchId: string, buyerId: string, results: EmailResult[]): Promise<void>
}

export async function handleManualEmail(input: unknown, deps: EmailDependencies): Promise<Response> {
  try {
    return await processManualEmail(input, deps)
  } catch {
    return Response.json({ error: 'Email indisponível ou resultado não confirmado. Preserve o identificador e consulte novamente; não crie outro envio.' }, { status: 503 })
  }
}

async function processManualEmail(input: unknown, deps: EmailDependencies): Promise<Response> {
  const actor = await deps.actor()
  if (!actor) return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  const v = input as Record<string, unknown> | null
  if (!v || !Array.isArray(v.leadIds) || v.leadIds.length < 1 || v.leadIds.length > 20 ||
      !v.leadIds.every(id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) ||
      typeof v.subject !== 'string' || !v.subject.trim() || v.subject.length > 200 || /[\r\n\x00-\x1f\x7f]/.test(v.subject) ||
      typeof v.body !== 'string' || !v.body.trim() || v.body.length > 10000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v.body) ||
      typeof v.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.requestId) ||
      (v.preview !== true && (v.confirmed !== true || v.consentConfirmed !== true))) {
    return Response.json({ error: 'Informe até 20 leads, assunto (200 caracteres), mensagem (10000 caracteres) e confirme a autorização de contato.' }, { status: 400 })
  }
  const leadIds = [...new Set(v.leadIds as string[])]
  const leads = await deps.ownedLeads(actor.id, leadIds)
  if (leads.length !== leadIds.length || leads.some(l => l.assigned_to !== actor.id)) {
    return Response.json({ error: 'Um ou mais leads não pertencem à sua conta.' }, { status: 403 })
  }
  const config = deps.config()
  const preferences = await deps.preferences(actor.id, leads.map(l => normalizeEmail(l.email)).filter((email): email is string => !!email))
  const suppressed = new Set(preferences.filter(p => p.suppressed_at).map(p => p.email))
  const seen = new Set<string>()
  const recipients = leads.sort((a, b) => a.id.localeCompare(b.id)).map(lead => {
    const email = normalizeEmail(lead.email)
    const reason = !email ? 'email_invalido' : suppressed.has(email) ? 'descadastrado' : seen.has(email) ? 'email_duplicado' : undefined
    if (email) seen.add(email)
    return { leadId: lead.id, name: lead.name, email, status: reason ? 'skipped' : 'ready', reason }
  })
  const subject = v.subject.trim()
  const body = v.body.trim()
  const footer = `${config.postalAddress}\n\nNão receber emails manuais deste cliente / Unsubscribe / Cancelar suscripción: [link individual]`
  // Bind confirmation to the actual current recipients and copy, not browser-supplied emails.
  const previewHash = createHash('sha256').update(JSON.stringify({ buyerId: actor.id, recipients: recipients.map(r => [r.leadId, r.email]), subject, body, config })).digest('hex')
  if (v.preview === true) return Response.json({ preview: true, recipients, subject, body, footer, from: config.from, previewHash })
  if (v.previewHash !== previewHash) return Response.json({ error: 'A prévia mudou. Revise os destinatários e confirme novamente.' }, { status: 409 })
  const batch = await deps.reserve(actor.id, v.requestId, previewHash, recipients.filter(r => r.status === 'ready').length)
  if (batch.limited) return Response.json({ error: 'Limite de email atingido: 20 por minuto ou 100 em 24 horas. Aguarde antes de consultar novamente.' }, { status: 429, headers: { 'Retry-After': '60' } })
  if (!batch.fresh) {
    if (batch.payload_hash !== previewHash) return Response.json({ error: 'Identificador já utilizado para outra mensagem.' }, { status: 409 })
    if (batch.status !== 'completed') return Response.json({ error: 'Envio em processamento ou resultado incerto. Não crie outro envio; consulte novamente com o mesmo identificador.' }, { status: 409 })
    return Response.json({ results: batch.results, replayed: true })
  }
  const results: EmailResult[] = []
  for (const recipient of recipients) {
    if (recipient.reason || !recipient.email) {
      results.push({ leadId: recipient.leadId, status: 'skipped', reason: recipient.reason })
      continue
    }
    // Recheck after reservation: a long batch must not use stale ownership or opt-out data.
    const current = await deps.ownedLeads(actor.id, [recipient.leadId])
    if (current.length !== 1 || current[0].assigned_to !== actor.id || normalizeEmail(current[0].email) !== recipient.email) {
      results.push({ leadId: recipient.leadId, status: 'skipped', reason: 'cadastro_alterado' })
      continue
    }
    const preference = await deps.preference(actor.id, recipient.email)
    if (preference.suppressed_at) {
      results.push({ leadId: recipient.leadId, status: 'skipped', reason: 'descadastrado' })
      continue
    }
    const url = `${config.origin}/api/leads/email/unsubscribe?token=${preference.token}`
    try {
      const response = await deps.send({ from: config.from, to: recipient.email, subject,
        text: `${body}\n\n---\n${footer.replace('[link individual]', url)}`,
        headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }, `manual-email/${batch.id}/${recipient.leadId}`)
      results.push(response.error
        ? { leadId: recipient.leadId, status: 'failed', reason: 'provedor_recusou' }
        : response.data?.id ? { leadId: recipient.leadId, status: 'accepted' }
          : { leadId: recipient.leadId, status: 'unknown', reason: 'resultado_incerto' })
    } catch {
      // A timeout may happen after provider acceptance. Never automatically retry.
      results.push({ leadId: recipient.leadId, status: 'unknown', reason: 'resultado_incerto' })
    }
  }
  await deps.finish(batch.id, actor.id, results)
  return Response.json({ results, replayed: false })
}
