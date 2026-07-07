import { createServerSupabase } from '@/lib/supabase/server'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/** Resolve o buyer da SESSÃO logada (via cookie). null = não autenticado / sem buyer. */
export async function callerBuyer(db: Db): Promise<{ id: string; isAdmin: boolean } | null> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: b } = await db.from('buyers').select('id, is_admin').eq('auth_user_id', user.id).maybeSingle()
  if (!b) return null
  return { id: b.id, isAdmin: !!b.is_admin }
}

/** true se o caller pode agir como o buyerId alvo (é ele mesmo ou admin). */
export function canActAs(caller: { id: string; isAdmin: boolean } | null, buyerId: string): boolean {
  return !!caller && (caller.isAdmin || caller.id === buyerId)
}
