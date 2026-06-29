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
  const allowed =
    isAdmin ||
    buyer.crm_subscription_status === 'active' ||
    (await hasPurchased(db, buyer.id))

  return {
    db,
    me: { id: buyer.id, name: buyer.name || 'Membro', isAdmin },
    allowed,
  }
}
