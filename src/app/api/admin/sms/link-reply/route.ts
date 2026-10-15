import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Recuperação manual e atômica de uma resposta. Sem avisos ou replay do inbound. */
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

    const { data, error } = await db.rpc('link_orphan_sms_reply', {
      p_message_id: message_id, p_lead_id: lead_id, p_expected_owner_id: expected_owner_id,
    })
    if (error || !data || typeof data.ok !== 'boolean') return fail('Falha ao recuperar; confira o estado antes de repetir.', 503)
    if (!data.ok) {
      const messages: Record<string, string> = {
        invalid: 'Identificadores inválidos.', not_found: 'Cadastro ou resposta não encontrados.',
        owner_changed: 'O responsável pelo cadastro mudou.', not_inbound: 'A mensagem não é uma resposta recebida.',
        already_owned: 'A resposta já pertence a outro cadastro.', phone_mismatch: 'O telefone não corresponde ao cadastro.',
        no_history: 'Sem envio anterior que confirme esta conversa.', changed: 'A resposta mudou durante a recuperação.',
        busy: 'Cadastro ou resposta em alteração. Confira o estado antes de repetir.',
      }
      const status = data.reason === 'not_found' ? 404 : data.reason === 'invalid' ? 400 : 409
      return fail(messages[data.reason] || 'Não foi possível recuperar esta resposta.', status)
    }
    const { data: confirmed, error: confirmError } = await db.from('sms_messages')
      .select('id, lead_id').eq('id', message_id).maybeSingle()
    if (confirmError || confirmed?.lead_id !== lead_id) return fail('Não foi possível confirmar a recuperação; confira o estado.', 503)
    return NextResponse.json({ linked: true, already_linked: data.already_linked === true, message_id, lead_id })
  } catch {
    return fail('Não foi possível concluir a recuperação; confira o estado antes de repetir.', 503)
  }
}
