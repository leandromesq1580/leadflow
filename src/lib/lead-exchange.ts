import { createAdminClient } from './supabase/admin'

/**
 * TROCA DE LEADS (decisão 2026-07-25).
 * Elegível = lead atribuído há ≥14 dias E, nos últimos 14 dias:
 *   - ≥8 dias DISTINTOS com tentativa de contato (ligação registrada OU SMS auto), e
 *   - ZERO resposta do lead: nenhum WhatsApp recebido, nenhum SMS recebido,
 *     nenhuma ligação atendida, sem reunião marcada e sem contrato fechado.
 * Teto anti-abuso: pedidos (pendentes+aprovados) ≤ 30% dos leads PAGOS do comprador.
 * Tudo é calculado dos registros AUTOMÁTICOS (follow-ups/sms/whatsapp) — auditoria
 * objetiva, não palavra do cliente.
 */

const WINDOW_DAYS = 14
const MIN_ATTEMPT_DAYS = 8
const CAP_PCT = 0.3

export interface ExchangeEligibility {
  eligible: boolean
  reasons: string[]           // por que NÃO é elegível (vazio se elegível)
  dossier: {
    assignedAt: string | null
    attemptDays: number       // dias distintos com tentativa nos últimos 14
    calls: number             // ligações no período
    smsSent: number           // SMS auto no período
    inboundWhatsapp: number
    inboundSms: number
    answeredCalls: number
    capUsed: number           // trocas já pedidas/aprovadas
    capMax: number            // teto (30% dos pagos)
  }
}

type Db = ReturnType<typeof createAdminClient>

export async function checkExchangeEligibility(db: Db, leadId: string, buyerId: string): Promise<ExchangeEligibility> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString()
  const reasons: string[] = []

  const { data: lead } = await db.from('leads')
    .select('id, assigned_to, assigned_at, status, contract_closed')
    .eq('id', leadId).maybeSingle()
  if (!lead || lead.assigned_to !== buyerId) {
    return { eligible: false, reasons: ['Lead não pertence a este comprador.'], dossier: emptyDossier() }
  }

  // Trabalho registrado: ligações (follow-up type call) + SMS auto (marker)
  const { data: fus } = await db.from('follow_ups')
    .select('type, description, created_at')
    .eq('lead_id', leadId).eq('buyer_id', buyerId)
    .gte('created_at', since)
  const calls = (fus || []).filter(f => f.type === 'call' && String(f.description || '').includes('📞'))
  const smsAuto = (fus || []).filter(f => String(f.description || '').startsWith('📱 SMS auto'))
  const answeredCalls = calls.filter(f => /Atendeu/.test(String(f.description || ''))).length
  const dayOf = (iso: string) => String(iso).slice(0, 10)
  const attemptDays = new Set([...calls, ...smsAuto].map(f => dayOf(f.created_at as string))).size

  // Respostas do lead no período
  const { count: inWa } = await db.from('whatsapp_messages')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', leadId).eq('direction', 'in').gte('sent_at', since)
  let inSms = 0
  try {
    const { count } = await db.from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('lead_id', leadId).eq('direction', 'in').gte('created_at', since)
    inSms = count || 0
  } catch { /* tabela sms pode não existir em ambientes antigos */ }

  // Teto 30% dos leads PAGOS (price_per_unit > 0)
  const { data: paid } = await db.from('credits')
    .select('total_purchased, price_per_unit')
    .eq('buyer_id', buyerId).eq('type', 'lead')
  const totalPaid = (paid || []).filter(c => Number(c.price_per_unit) > 0)
    .reduce((s, c) => s + (c.total_purchased || 0), 0)
  const capMax = Math.floor(totalPaid * CAP_PCT)
  let capUsed = 0
  try {
    const { count } = await db.from('lead_exchange_requests')
      .select('*', { count: 'exact', head: true })
      .eq('buyer_id', buyerId).in('status', ['pending', 'approved'])
    capUsed = count || 0
  } catch { /* migration 032 ainda não rodou */ }

  const ageMs = lead.assigned_at ? Date.now() - new Date(lead.assigned_at).getTime() : 0
  if (!lead.assigned_at || ageMs < WINDOW_DAYS * 86400_000) reasons.push(`Lead ainda não completou ${WINDOW_DAYS} dias com você.`)
  if (attemptDays < MIN_ATTEMPT_DAYS) reasons.push(`Tentativas em ${attemptDays} dia(s) — precisa de ${MIN_ATTEMPT_DAYS} dias distintos nos últimos ${WINDOW_DAYS}.`)
  if ((inWa || 0) > 0 || inSms > 0) reasons.push('O lead respondeu no período (WhatsApp/SMS) — não é elegível.')
  if (answeredCalls > 0) reasons.push('Houve ligação atendida no período — não é elegível.')
  if (lead.contract_closed || lead.status === 'appointment_set') reasons.push('Lead com reunião marcada ou contrato — não é elegível.')
  if (capMax <= 0) reasons.push('Sem pacote pago suficiente para o teto de trocas.')
  else if (capUsed >= capMax) reasons.push(`Teto de trocas atingido (${capUsed}/${capMax} = 30% dos leads pagos).`)

  return {
    eligible: reasons.length === 0,
    reasons,
    dossier: {
      assignedAt: lead.assigned_at || null,
      attemptDays, calls: calls.length, smsSent: smsAuto.length,
      inboundWhatsapp: inWa || 0, inboundSms: inSms,
      answeredCalls, capUsed, capMax,
    },
  }
}

function emptyDossier() {
  return { assignedAt: null, attemptDays: 0, calls: 0, smsSent: 0, inboundWhatsapp: 0, inboundSms: 0, answeredCalls: 0, capUsed: 0, capMax: 0 }
}
