import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function smsPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) return `1${digits}`
  return digits.length >= 11 && digits.length <= 15 ? digits : null
}

/** Recuperação manual, uma resposta por chamada. Não envia avisos nem reproduz INSERT/triggers. */
export async function POST(request: Request) {
  const fail = (error: string, status: number) => NextResponse.json({ error }, { status })
  try {
    const db = createAdminClient()
    const caller = await callerBuyer(db)
    if (!caller) return fail('Não autenticado.', 401)
    if (!caller.isAdmin) return fail('Somente administradores.', 403)
    const payload = await request.json().catch(() => null)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('Dados inválidos.', 400)
    const { message_id, lead_id, expected_owner_id } = payload
    if (![message_id, lead_id, expected_owner_id].every(id => typeof id === 'string' && uuid.test(id))) return fail('Identificadores inválidos.', 400)

    const { data: lead, error: leadError } = await db.from('leads')
      .select('id, phone, assigned_to').eq('id', lead_id).maybeSingle()
    if (leadError) return fail('Não foi possível consultar o cadastro.', 503)
    if (!lead) return fail('Cadastro não encontrado.', 404)
    if (lead.assigned_to !== expected_owner_id) return fail('O responsável pelo cadastro mudou.', 409)
    const { data: message, error: messageError } = await db.from('sms_messages')
      .select('id, lead_id, direction, status, from_phone, created_at').eq('id', message_id).maybeSingle()
    if (messageError) return fail('Não foi possível consultar a resposta.', 503)
    if (!message) return fail('Resposta não encontrada.', 404)
    if (message.direction !== 'in' || message.status !== 'received') return fail('A mensagem não é uma resposta recebida.', 409)
    if (message.lead_id && message.lead_id !== lead_id) return fail('A resposta já pertence a outro cadastro.', 409)
    const phone = smsPhone(lead.phone || '')
    if (!phone || phone !== smsPhone(message.from_phone || '')) return fail('O telefone da resposta não corresponde ao cadastro.', 409)
    if (message.lead_id === lead_id) return NextResponse.json({ linked: true, already_linked: true, message_id, lead_id })

    // Só recupera resposta sustentada por envio anterior do cadastro indicado.
    const { data: outbound, error: outboundError } = await db.from('sms_messages')
      .select('id').eq('lead_id', lead_id).eq('direction', 'out')
      .in('status', ['sent', 'delivered']).eq('to_phone', phone)
      .lte('created_at', message.created_at).limit(1)
    if (outboundError) return fail('Não foi possível conferir o histórico.', 503)
    if (!outbound?.length) return fail('Sem envio anterior que confirme esta conversa.', 409)

    // Compare-and-set: jamais sobrescrever vínculo que outro operador já recuperou.
    const { data: changed, error: writeError } = await db.from('sms_messages')
      .update({ lead_id }).eq('id', message_id).is('lead_id', null)
      .eq('direction', 'in').eq('status', 'received')
      .eq('from_phone', message.from_phone).eq('created_at', message.created_at)
      .select('id, lead_id')
    if (writeError) return fail('Falha ao recuperar; confira o estado antes de repetir.', 503)
    if (changed?.length !== 1) return fail('A resposta mudou durante a recuperação; confira antes de repetir.', 409)
    const { data: confirmed, error: confirmError } = await db.from('sms_messages')
      .select('id, lead_id').eq('id', message_id).maybeSingle()
    if (confirmError || confirmed?.lead_id !== lead_id) return fail('Não foi possível confirmar a recuperação; confira o estado.', 503)
    return NextResponse.json({ linked: true, already_linked: false, message_id, lead_id })
  } catch {
    return fail('Não foi possível concluir a recuperação; confira o estado antes de repetir.', 503)
  }
}
