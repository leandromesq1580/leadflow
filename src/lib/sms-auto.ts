import { createAdminClient } from './supabase/admin'
import { sendSms, toE164 } from './twilio'
import { buyerTimezone } from './availability'

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

export function buildSmsBody(leadName?: string | null, buyerName?: string | null): string {
  const first = String(leadName || '').trim().split(/\s+/)[0]
  const who = (buyerName || '').trim() || 'seu corretor'
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

/**
 * Chamado quando uma ligação termina SEM contato. Envia agora se estiver na janela;
 * senão AGENDA pro próximo horário permitido. Retorna o que fez (pra log).
 */
export async function sendOrScheduleAutoSms(
  db: Db, leadId: string, buyerId: string | null
): Promise<'sent' | 'scheduled' | 'skipped'> {
  const { data: lead } = await db.from('leads')
    .select('name, phone, state, sms_opted_out').eq('id', leadId).maybeSingle()
  const e164 = toE164(lead?.phone)
  if (!lead || lead.sms_opted_out || !e164) return 'skipped'

  const tz = leadTimezone(lead.state)
  const { total, sentToday } = await smsHistory(db, leadId, tz)
  if (total >= SMS_MAX_TOTAL || sentToday) return 'skipped'

  // já existe um agendado pendente? não duplica
  try {
    const { data: pend } = await db.from('sms_messages')
      .select('id').eq('lead_id', leadId).eq('status', 'scheduled').limit(1).maybeSingle()
    if (pend) return 'skipped'
  } catch { /* coluna/migration ausente → segue */ }

  let buyerName = ''
  if (buyerId) {
    const { data: b } = await db.from('buyers').select('name').eq('id', buyerId).maybeSingle()
    buyerName = b?.name || ''
  }
  const body = buildSmsBody(lead.name, buyerName)

  if (isWithinSmsWindow(tz)) {
    const res = await sendSms(e164, body)
    if (!res.ok) { console.warn('[sms-auto] envio falhou:', res.error); return 'skipped' }
    await db.from('sms_messages').insert({
      lead_id: leadId, direction: 'out', to_phone: e164.replace(/\D/g, ''),
      body, status: 'sent', twilio_sid: res.sid || null,
    })
    await db.from('follow_ups').insert({
      lead_id: leadId, buyer_id: buyerId, type: 'note',
      description: `📱 SMS auto (${total + 1}/${SMS_MAX_TOTAL}) — tentativa de ligação sem contato`,
      status: 'completed', completed_at: new Date().toISOString(),
    })
    return 'sent'
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
    const { data } = await db.from('sms_messages')
      .select('id, lead_id, to_phone, body, scheduled_for')
      .eq('status', 'scheduled').lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for').limit(30)
    rows = data || []
  } catch { return 0 } // migration 034 ainda não rodou
  if (rows.length === 0) return 0

  for (const row of rows) {
    try {
      const { data: lead } = await db.from('leads')
        .select('name, state, sms_opted_out, assigned_to').eq('id', row.lead_id).maybeSingle()
      if (!lead) { await db.from('sms_messages').update({ status: 'failed', error: 'lead removido' }).eq('id', row.id); continue }

      const tz = leadTimezone(lead.state)
      if (!isWithinSmsWindow(tz)) continue // ainda fora da janela → espera o próximo ciclo

      if (lead.sms_opted_out) {
        await db.from('sms_messages').update({ status: 'canceled', error: 'opt-out' }).eq('id', row.id); continue
      }
      if (await leadRespondeu(db, row.lead_id, row.scheduled_for ? new Date(new Date(row.scheduled_for).getTime() - 24 * 3600_000).toISOString() : new Date(Date.now() - 24 * 3600_000).toISOString())) {
        await db.from('sms_messages').update({ status: 'canceled', error: 'lead respondeu' }).eq('id', row.id); continue
      }
      const { total, sentToday } = await smsHistory(db, row.lead_id, tz)
      if (total >= SMS_MAX_TOTAL || sentToday) {
        await db.from('sms_messages').update({ status: 'canceled', error: 'limite diário/total' }).eq('id', row.id); continue
      }

      const res = await sendSms(`+${String(row.to_phone).replace(/\D/g, '')}`, row.body)
      if (!res.ok) {
        await db.from('sms_messages').update({ status: 'failed', error: (res.error || '').slice(0, 200) }).eq('id', row.id)
        continue
      }
      await db.from('sms_messages').update({ status: 'sent', twilio_sid: res.sid || null, error: null }).eq('id', row.id)
      await db.from('follow_ups').insert({
        lead_id: row.lead_id, buyer_id: lead.assigned_to || null, type: 'note',
        description: `📱 SMS auto (${total + 1}/${SMS_MAX_TOTAL}) — tentativa de ligação sem contato`,
        status: 'completed', completed_at: new Date().toISOString(),
      })
      sent++
      console.log(`[sms-auto] agendado despachado -> lead ${row.lead_id}`)
    } catch (e: any) {
      console.error('[sms-auto] erro no despacho', row.id, e?.message)
    }
  }
  if (sent > 0) console.log(`[sms-auto] ${sent} SMS agendado(s) enviados`)
  return sent
}
