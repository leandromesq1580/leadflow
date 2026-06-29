import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPurchased } from '@/lib/starter'

export interface CommunityMe {
  id: string
  name: string
  isAdmin: boolean
}

/**
 * Resolve o buyer logado e diz se ele é MEMBRO PAGANTE da comunidade.
 * Pagante = admin OU assinatura CRM ativa OU já comprou algo (lead/appointment).
 * Retorna null se não houver sessão/buyer (→ 401 na rota).
 */
export async function getCommunityContext(): Promise<{
  db: ReturnType<typeof createAdminClient>
  me: CommunityMe
  allowed: boolean
  banned: boolean
} | null> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const db = createAdminClient()
  const { data: buyer } = await db
    .from('buyers')
    .select('id, name, is_admin, crm_subscription_status')
    .eq('auth_user_id', user.id)
    .single()
  if (!buyer) return null

  const isAdmin = !!buyer.is_admin

  // Banido da comunidade? (admin nunca é banido). Tolera tabela inexistente (migration 026).
  let banned = false
  if (!isAdmin) {
    try {
      const { data: ban } = await db.from('community_bans').select('buyer_id').eq('buyer_id', buyer.id).maybeSingle()
      banned = !!ban
    } catch {}
  }

  const allowed = !banned && (
    isAdmin ||
    buyer.crm_subscription_status === 'active' ||
    (await hasPurchased(db, buyer.id))
  )

  return {
    db,
    me: { id: buyer.id, name: buyer.name || 'Membro', isAdmin },
    allowed,
    banned,
  }
}

/** Cria uma notificação pro destinatário. No-op se for pra si mesmo ou se a tabela ainda não existe. */
export async function notifyCommunity(
  db: ReturnType<typeof createAdminClient>,
  opts: { recipientId?: string | null; actorId: string; actorName: string; type: 'comment' | 'reaction' | 'mention'; postId: string; preview?: string },
) {
  if (!opts.recipientId || opts.recipientId === opts.actorId) return
  try {
    await db.from('community_notifications').insert({
      recipient_id: opts.recipientId,
      actor_id: opts.actorId,
      actor_name: opts.actorName,
      type: opts.type,
      post_id: opts.postId,
      preview: opts.preview ? opts.preview.slice(0, 120) : null,
    })
  } catch {}
}

/** Procura @Nome no texto, casa com nomes de membros e notifica os mencionados (menos o autor). */
export async function notifyMentions(
  db: ReturnType<typeof createAdminClient>,
  opts: { body?: string; actorId: string; actorName: string; postId: string },
) {
  const body = (opts.body || '').toLowerCase()
  if (!body.includes('@')) return
  try {
    const { data } = await db.from('buyers').select('id, name').not('name', 'is', null).limit(500)
    const seen = new Set<string>()
    for (const m of data || []) {
      const name = (m.name || '').trim()
      if (name.length < 3 || m.id === opts.actorId || seen.has(m.id)) continue
      if (body.includes('@' + name.toLowerCase())) {
        seen.add(m.id)
        await notifyCommunity(db, { recipientId: m.id, actorId: opts.actorId, actorName: opts.actorName, type: 'mention', postId: opts.postId, preview: opts.body })
      }
    }
  } catch {}
}
