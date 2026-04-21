import type { createAdminClient } from './supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/**
 * Resolve qual buyer_id é o "dono atual" do lead.
 * - Se lead.assigned_to_member está setado: retorna o buyer_id do membro
 *   (quando esse membro tem conta propria).
 * - Senao: retorna lead.assigned_to.
 *
 * Retorna null se o lead nao tem owner ou o membro nao tem conta propria.
 */
export async function getCurrentLeadOwner(db: Db, leadId: string): Promise<string | null> {
  const { data: lead } = await db
    .from('leads')
    .select('assigned_to, assigned_to_member')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) return null

  if (lead.assigned_to_member) {
    const { data: member } = await db
      .from('team_members')
      .select('auth_user_id')
      .eq('id', lead.assigned_to_member)
      .maybeSingle()
    if (member?.auth_user_id) {
      const { data: memberBuyer } = await db
        .from('buyers')
        .select('id')
        .eq('auth_user_id', member.auth_user_id)
        .maybeSingle()
      if (memberBuyer?.id) return memberBuyer.id
    }
    // fallback: se o membro nao tem conta, dono continua sendo o buyer original
    return lead.assigned_to || null
  }

  return lead.assigned_to || null
}

/**
 * Verifica se um buyer é o dono atual do lead.
 * Usado pra bloquear acesso a dados privados (ex: thread WhatsApp) de leads
 * que foram transferidos.
 */
export async function assertBuyerOwnsLead(db: Db, buyerId: string, leadId: string): Promise<{ ok: boolean; reason?: string }> {
  const ownerBuyerId = await getCurrentLeadOwner(db, leadId)
  if (!ownerBuyerId) return { ok: false, reason: 'Lead sem dono' }
  if (ownerBuyerId !== buyerId) return { ok: false, reason: 'Lead pertence a outro usuario' }
  return { ok: true }
}

/**
 * Migra todas as mensagens WhatsApp de um lead pro novo dono.
 * Chamado ao transferir um lead entre owner/membro — garante que quem passa
 * a ser dono veja a thread completa e quem perdeu o lead nao veja mais nada.
 */
export async function migrateWhatsAppOwnership(db: Db, leadId: string, newOwnerBuyerId: string): Promise<number> {
  const { data, error } = await db
    .from('whatsapp_messages')
    .update({ buyer_id: newOwnerBuyerId })
    .eq('lead_id', leadId)
    .neq('buyer_id', newOwnerBuyerId)
    .select('id')

  if (error) {
    console.error('[Ownership] migrateWhatsAppOwnership erro:', error.message)
    return 0
  }
  return data?.length || 0
}
