import { createAdminClient } from './supabase/admin'
import { sendSms, toE164 } from './twilio'
import { buyerTimezone } from './availability'
import { requireLeadMessageLocale, type LeadMessageLocale } from './lead-message-locale'
import { translateLeadCopy } from './lead-message-template'

/**
 * SMS AUTOMÁTICO pós-ligação sem contato — regras e fila.
 *
 * Janela TCPA: só 8h–20h59 no fuso do LEAD (multa é por mensagem; não negociável).
 * Antes (2026-07-25) o SMS fora da janela era DESCARTADO — o lead não recebia e o dia
 * não contava como tentativa na régua de troca. Agora (2026-07-29) ele é AGENDADO em
 * sms_messages (status='scheduled' + scheduled_for) e o cron despacha no horário certo.
 *
 * Limites (revalidados no envio, não só no agendamento): opt-out (STOP), 1 SMS/dia por
 * lead, 14 no total. E se o lead RESPONDER antes do horário, o agendamento é cancelado
 * (não faz sentido mandar "tentei te ligar" pra quem já respondeu).
 */
export const SMS_MAX_TOTAL = 14
const WINDOW_START = 8
const WINDOW_END = 21 // exclusivo: 21h já está fora

type Db = ReturnType<typeof createAdminClient>

export function leadTimezone(state?: string | null): string {
  return buyerTimezone(state ? [state] : null)
}

function localParts(tz: string, at: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(at)) if (part.type !== 'literal') p[part.type] = part.value
  return { hour: parseInt(p.hour, 10) % 24, minute: parseInt(p.minute, 10), day: `${p.year}-${p.month}-${p.day}` }
}

/** Está dentro da janela legal AGORA, no fuso do lead? */
export function isWithinSmsWindow(tz: string, at: Date = new Date()): boolean {
  const { hour } = localParts(tz, at)
  return hour >= WINDOW_START && hour < WINDOW_END
}

/** Próximo instante permitido (8h local do lead). Se já está na janela, retorna agora. */
export function nextWindowStart(tz: string, at: Date = new Date()): Date {
  if (isWithinSmsWindow(tz, at)) return at
  const { hour, minute } = localParts(tz, at)
  // horas até as 8h locais (mesmo dia se ainda for madrugada; senão amanhã)
  const hoursAhead = hour < WINDOW_START ? WINDOW_START - hour : 24 - hour + WINDOW_START
  const ms = at.getTime() + hoursAhead * 3600_000 - minute * 60_000
  return new Date(ms)
}

/** Dia local (YYYY-MM-DD) no fuso do lead — pra regra de 1 SMS/dia. */
export function localDay(tz: string, at: Date = new Date()): string {
  return localParts(tz, at).day
}

export function buildSmsBody(
  leadName?: string | null,
  buyerName?: string | null,
  locale: LeadMessageLocale = 'pt',
): string {
  const first = String(leadName || '').trim().split(/\s+/)[0]
  const configuredName = (buyerName || '').trim()
  if (locale === 'es') {
    const who = configuredName || 'tu agente'
    return `¡Hola${first ? ' ' + first : ''}! Soy ${who}. Intenté llamarte sobre tu cotización de seguro de vida, pero no pude comunicarme contigo. ¿Puedes responderme por aquí?`
  }
  if (locale === 'en') {
    const who = configuredName || 'your agent'
    return `Hi${first ? ' ' + first : ''}! This is ${who}. I tried to call you about your life insurance quote, but I couldn't reach you. Can you reply here?`
  }
  const who = configuredName || 'seu corretor'
  return `Oi${first ? ' ' + first : ''}! Aqui é ${who}. Tentei te ligar sobre sua cotação de seguro de vida, mas não consegui falar com você. Pode me retornar por aqui?`
}

/** Quantos SMS automáticos esse lead já recebeu + se já teve um hoje (fuso do lead). */
async function smsHistory(db: Db, leadId: string, tz: string) {
  const { data } = await db.from('follow_ups')
    .select('created_at').eq('lead_id', leadId).like('description', '📱 SMS auto%')
  const total = (data || []).length
  const today = localDay(tz)
  const sentToday = (data || []).some(r => localDay(tz, new Date(r.created_at as string)) === today)
  return { total, sentToday }
}

/** O lead respondeu algo desde `since`? (cancela SMS agendado) */
async function leadRespondeu(db: Db, leadId: string, since: string): Promise<boolean> {
  const { count: wa } = await db.from('whatsapp_messages')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', leadId).eq('direction', 'in').gte('sent_at', since)
  if ((wa || 0) > 0) return true
  try {
    const { count: sms } = await db.from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', leadId).eq('direction', 'in').gte('created_at', since)
    if ((sms || 0) > 0) return true
  } catch { /* tabela ausente */ }
  return false
}

/** Uncertainty is terminal for automatic retries. If this write fails, the
 * original sending reservation still fences redelivery (migration071). */
async function quarantineSms(db: Db, id: string) {
  try {
    const { error } = await db.from('sms_messages').update({ status: 'unknown', error: 'delivery_unknown' })
      .eq('id', id).in('status', ['sending', 'sent'])
    if (error) console.warn('[sms-auto] quarentena indisponível; manter reserva', id)
  } catch { console.warn('[sms-auto] quarentena indisponível; manter reserva', id) }
}

/** Called ONLY after a durable reservation, never before INSERT/CAS succeeds. */
async function sendReservedSms(db: Db, id: string, leadId: string, buyerId: string | null, phone: string, body: string, total: number): Promise<boolean> {
  try {
    const res = await sendSms(phone, body)
    // The transport's ok:false includes timeouts/network errors, not proof that
    // Twilio rejected the message. Even ok:true without a SID is unconfirmed.
    if (!res.ok || !res.sid) throw new Error('delivery_unknown')
    // Persist history before releasing sending so a failed note cannot allow a
    // second immediate send through the daily/total limit check.
    const note = await db.from('follow_ups').insert({
      lead_id: leadId, buyer_id: buyerId, type: 'note',
      description: `📱 SMS auto (${total + 1}/${SMS_MAX_TOTAL}) — tentativa de ligação sem contato`,
      status: 'completed', completed_at: new Date().toISOString(),
    }).select('id').single()
    if (note.error || !note.data?.id) throw new Error('history_unconfirmed')
    const finish = await db.from('sms_messages')
      .update({ status: 'sent', body, twilio_sid: res.sid, error: null })
      .eq('id', id).eq('status', 'sending').select('id').single()
    if (finish.error || !finish.data?.id) throw new Error('finish_unconfirmed')
    return true
  } catch {
    await quarantineSms(db, id)
    console.warn('[sms-auto] entrega incerta; sem reenvio automático', id)
    return false
  }
}

/**
 * Chamado quando uma ligação termina SEM contato. Envia agora se estiver na janela;
 * senão AGENDA pro próximo horário permitido. Retorna o que fez (pra log).
 */
export async function sendOrScheduleAutoSms(
  db: Db, leadId: string, buyerId: string | null
): Promise<'sent' | 'scheduled' | 'skipped'> {
  const { data: lead, error: leadError } = await db.from('leads')
    .select('name, phone, state, sms_opted_out, lead_language, form_name, meta_lead_id, redelivered_to_lead_id').eq('id', leadId).maybeSingle()
  const e164 = toE164(lead?.phone)
  if (leadError || !lead || lead.redelivered_to_lead_id || lead.sms_opted_out || !e164) return 'skipped'

  const tz = leadTimezone(lead.state)
  const { total, sentToday } = await smsHistory(db, leadId, tz)
  if (total >= SMS_MAX_TOTAL || sentToday) return 'skipped'

  // Pending AND uncertain transport fences a new immediate attempt. Read errors
  // cannot be interpreted as an empty queue (or a missing migration bypass).
  try {
    const { data: pend, error } = await db.from('sms_messages')
      .select('id').eq('lead_id', leadId).eq('direction', 'out')
      .in('status', ['scheduled', 'sending', 'queued', 'unknown']).limit(1).maybeSingle()
    if (error || pend) return 'skipped'
  } catch { return 'skipped' }

  let buyerName = ''
  const locale = requireLeadMessageLocale(lead)
  if (buyerId) {
    const { data: b } = await db.from('buyers').select('name').eq('id', buyerId).maybeSingle()
    buyerName = b?.name || ''
  }
  const body = buildSmsBody(lead.name, buyerName, locale)

  if (isWithinSmsWindow(tz)) {
    // migration071 locks the source on INSERT. Retirement first rejects this
    // reservation; reservation first makes redelivery return source_busy.
    try {
      const { data: reserved, error } = await db.from('sms_messages').insert({
        lead_id: leadId, direction: 'out', to_phone: e164.replace(/\D/g, ''), body, status: 'sending',
      }).select('id').single()
      if (error || !reserved?.id) return 'skipped'
      return await sendReservedSms(db, reserved.id, leadId, buyerId, e164, body, total) ? 'sent' : 'skipped'
    } catch {
      // An unconfirmed INSERT may have committed. Do not send or clear it.
      return 'skipped'
    }
  }

  // Fora da janela → agenda pro próximo horário permitido
  const when = nextWindowStart(tz)
  const { error } = await db.from('sms_messages').insert({
    lead_id: leadId, direction: 'out', to_phone: e164.replace(/\D/g, ''),
    body, status: 'scheduled', scheduled_for: when.toISOString(),
  })
  if (error) {
    // migration 034 pendente → comportamento antigo (não envia), sem quebrar a ligação
    console.warn('[sms-auto] agendamento indisponível:', error.message)
    return 'skipped'
  }
  console.log(`[sms-auto] fora da janela (${tz}) — SMS agendado p/ ${when.toISOString()} (lead ${leadId})`)
  return 'scheduled'
}

/**
 * Despachante da fila (roda no cron do poll-leads). Envia os agendados cujo horário
 * chegou E que ainda estão dentro da janela; revalida opt-out/limites; cancela se o
 * lead respondeu no meio do caminho.
 */
export async function dispatchScheduledSms(): Promise<number> {
  const db = createAdminClient()
  let sent = 0
  let rows: any[] = []
  try {
    const { data, error } = await db.from('sms_messages')
      .select('id, lead_id, to_phone, body, scheduled_for')
      .eq('status', 'scheduled').eq('direction', 'out').lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for').limit(30)
    if (error) return 0
    rows = data || []
  } catch { return 0 } // migration 034 ainda não rodou
  if (rows.length === 0) return 0

  for (const row of rows) {
    try {
      const { data: lead, error: leadError } = await db.from('leads')
        .select('name, state, sms_opted_out, assigned_to, lead_language, form_name, meta_lead_id, redelivered_to_lead_id').eq('id', row.lead_id).maybeSingle()
      if (leadError) continue
      if (!lead) { await db.from('sms_messages').update({ status: 'failed', error: 'lead removido' }).eq('id', row.id).eq('status', 'scheduled'); continue }
      if (lead.redelivered_to_lead_id) {
        await db.from('sms_messages').update({ status: 'canceled', error: 'source_redelivered' }).eq('id', row.id).eq('status', 'scheduled'); continue
      }

      const tz = leadTimezone(lead.state)
      if (!isWithinSmsWindow(tz)) continue // ainda fora da janela → espera o próximo ciclo

      if (lead.sms_opted_out) {
        await db.from('sms_messages').update({ status: 'canceled', error: 'opt-out' }).eq('id', row.id).eq('status', 'scheduled'); continue
      }
      if (await leadRespondeu(db, row.lead_id, row.scheduled_for ? new Date(new Date(row.scheduled_for).getTime() - 24 * 3600_000).toISOString() : new Date(Date.now() - 24 * 3600_000).toISOString())) {
        await db.from('sms_messages').update({ status: 'canceled', error: 'lead respondeu' }).eq('id', row.id).eq('status', 'scheduled'); continue
      }
      const { total, sentToday } = await smsHistory(db, row.lead_id, tz)
      if (total >= SMS_MAX_TOTAL || sentToday) {
        await db.from('sms_messages').update({ status: 'canceled', error: 'limite diário/total' }).eq('id', row.id).eq('status', 'scheduled'); continue
      }

      // Resolve again at dispatch: even messages queued before this fix must use
      // the lead's current language. Never fall back to the previously queued text.
      const locale = requireLeadMessageLocale(lead)
      const copy = await translateLeadCopy(db, { body: row.body, subject: null }, locale)
      // Batch reads do not reserve work. CAS plus migration071's source-row
      // trigger serialize independent workers and retirement before transport.
      const claim = await db.from('sms_messages').update({ status: 'sending', body: copy.body, error: null })
        .eq('id', row.id).eq('lead_id', row.lead_id).eq('direction', 'out')
        .eq('status', 'scheduled').select('id').maybeSingle()
      if (claim.error || !claim.data?.id) continue
      if (!await sendReservedSms(db, row.id, row.lead_id, lead.assigned_to || null,
        `+${String(row.to_phone).replace(/\D/g, '')}`, copy.body, total)) continue
      sent++
      console.log(`[sms-auto] agendado despachado -> lead ${row.lead_id}`)
    } catch (e: any) {
      // Pre-transport errors may be retried, but never touch another worker's
      // sending/unknown row (including an unconfirmed claim that committed).
      try {
        await db.from('sms_messages').update({ error: String(e?.message || 'preflight unavailable').slice(0, 300) })
          .eq('id', row.id).eq('status', 'scheduled')
      } catch { /* keep existing reservation/status */ }
      console.error('[sms-auto] preflight indisponível', row.id)
    }
  }
  if (sent > 0) console.log(`[sms-auto] ${sent} SMS agendado(s) enviados`)
  return sent
}
