import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateTwilioSignature, isOptOut } from '@/lib/twilio'
import { notifyGroupSmsReply, notifySmsReplyToOwner } from '@/lib/notifications'
import { pushToBuyer } from '@/lib/push-notify'
import { localeDoBuyer, trad } from '@/lib/buyer-locale'

type LeadCandidate = { id: string; name: string | null; assigned_to: string | null; created_at: string }

/**
 * Escolhe QUAL cadastro de lead recebe a resposta quando o telefone bate em
 * mais de um (duplicidade legítima entre contas diferentes). Nunca "o mais
 * recente" — isso mistura a conversa de um cliente na caixa de outro. Prefere
 * o lead que já tem uma mensagem OUTBOUND (a pergunta que está sendo
 * respondida); sem ambiguidade real, cai no único candidato ou no mais antigo.
 */
async function resolveLeadForInboundSms(
  db: ReturnType<typeof createAdminClient>, candidates: LeadCandidate[]
): Promise<LeadCandidate | null> {
  if (candidates.length <= 1) return candidates[0] || null
  const { data: outbound } = await db.from('sms_messages')
    .select('lead_id, created_at')
    .eq('direction', 'out')
    .in('lead_id', candidates.map(c => c.id))
    .order('created_at', { ascending: false })
  const conversed = new Set((outbound || []).map((r: { lead_id: string }) => r.lead_id))
  const withHistory = candidates.filter(c => conversed.has(c.id))
  if (withHistory.length === 1) return withHistory[0]
  if (withHistory.length > 1) {
    // Mais de um teve conversa: fica com quem mandou o SMS mais recente (o que
    // está sendo respondido agora), não com o cadastro mais recentemente criado.
    const mostRecentOutboundLeadId = (outbound || [])[0]?.lead_id
    return candidates.find(c => c.id === mostRecentOutboundLeadId) || candidates[0]
  }
  // Nenhum tem histórico de SMS enviado — sem sinal pra desambiguar; usa o
  // cadastro mais antigo (o comportamento anterior favorecia o mais novo, que
  // é exatamente o padrão do bug: duplicata recém-criada rouba a conversa).
  return [...candidates].sort((a, b) => a.created_at.localeCompare(b.created_at))[0] || null
}

/**
 * POST /api/webhook/twilio-sms — resposta de SMS chegando (configurar este URL
 * no número Twilio em "A message comes in").
 * Valida a assinatura, casa o remetente com o lead, grava em sms_messages
 * (direction=in), avisa o grupo de controle e trata opt-out (STOP).
 * Resposta: TwiML vazio (não responde nada automático ao lead).
 */
export async function POST(request: NextRequest) {
  const twiml = (xml = '<Response></Response>') =>
    new Response(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, { headers: { 'Content-Type': 'text/xml' } })

  const raw = await request.text()
  const params: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v

  // Assinatura: monta o URL público exato (Twilio assina o URL configurado)
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'lead4producers.com'
  const url = `https://${host}/api/webhook/twilio-sms`
  const sig = request.headers.get('x-twilio-signature')
  if (!validateTwilioSignature(url, params, sig)) {
    console.warn('[Twilio SMS] assinatura inválida — descartado')
    return new Response('Forbidden', { status: 403 })
  }

  const from = params.From || ''
  const to = params.To || ''
  const body = params.Body || ''
  const sid = params.MessageSid || params.SmsSid || ''
  if (!from || !sid) return twiml()

  const db = createAdminClient()

  // Dedupe por SID (Twilio re-tenta o webhook em timeout)
  const { data: dup } = await db.from('sms_messages').select('id').eq('twilio_sid', sid).maybeSingle()
  if (dup) return twiml()

  // Casa o lead pelos últimos 10 dígitos (mesmo padrão do webhook do WhatsApp).
  // Um mesmo telefone pode ter MAIS DE UM cadastro de lead (duplicidade legítima:
  // reimportação, novo formulário, etc.), cada um com um dono (assigned_to)
  // diferente. Pegar sempre "o mais recente" (bug real, 2026-09-22) faz a
  // resposta do cliente cair no dono ERRADO quando o cadastro mais novo nunca
  // trocou mensagem com esse contato — mistura a conversa entre duas contas.
  const digits = from.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  const { data: candidates } = await db.from('leads')
    .select('id, name, assigned_to, created_at')
    .or(`phone.ilike.%${last10},phone.eq.${digits},phone.eq.+${digits}`)
    .order('created_at', { ascending: false })
    .limit(10)
  const lead = await resolveLeadForInboundSms(db, candidates || [])

  await db.from('sms_messages').insert({
    lead_id: lead?.id || null,
    direction: 'in',
    from_phone: digits,
    to_phone: to.replace(/\D/g, ''),
    body,
    status: 'received',
    twilio_sid: sid,
  })

  // Opt-out: marca o lead e NÃO alerta o grupo (é despedida, não interesse)
  if (isOptOut(body)) {
    if (lead?.id) {
      try { await db.from('leads').update({ sms_opted_out: true }).eq('id', lead.id) } catch {}
    }
    console.log(`[Twilio SMS] opt-out de ${digits}`)
    return twiml()
  }

  // Alerta o grupo de controle (não bloqueia a resposta ao Twilio)
  try { await notifyGroupSmsReply(lead?.name || null, digits, body) } catch (e) {
    console.error('[Twilio SMS] alerta grupo falhou:', (e as any)?.message)
  }

  // Avisa o DONO do lead (caso Robson, 2026-08-10): antes o corretor mandava SMS,
  // o lead respondia e só o admin ficava sabendo. WhatsApp pela bridge global +
  // push no celular; a resposta em si já aparece na aba Conversa (etiqueta SMS).
  if (lead?.id && lead?.assigned_to) {
    try { await notifySmsReplyToOwner(lead.assigned_to, lead.name || null, lead.id, body) } catch (e) {
      console.error('[Twilio SMS] aviso ao dono falhou:', (e as any)?.message)
    }
    try {
      // Idioma do dono do lead (settings, via buyer-locale) — webhook não tem cookie; falha vira 'pt'
      const T = trad(await localeDoBuyer(db, lead.assigned_to))
      await pushToBuyer(lead.assigned_to, {
        title: T(
          `💬 ${lead.name || 'Seu lead'} respondeu seu SMS`,
          `💬 ${lead.name || 'Your lead'} replied to your SMS`,
          `💬 ${lead.name || 'Tu lead'} respondió a tu SMS`
        ),
        body: body.slice(0, 120),
        url: `/dashboard/whatsapp?lead=${lead.id}`,
        tag: `sms-reply-${lead.id}`,
      })
    } catch (e) { console.error('[Twilio SMS] push ao dono falhou:', (e as any)?.message) }
  }

  return twiml()
}
