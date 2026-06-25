import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/account/delete — exclusão de conta pelo próprio usuário (App Store 5.1.1(v)).
 * Exclusão REAL: remove o usuário de auth (login some) + anonimiza o PII do buyer +
 * desativa. Registros de negócio (leads/pagamentos) ficam anonimizados (retenção legal).
 * Admin NÃO pode se autoexcluir pelo app (segurança).
 */
export async function POST() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id, is_admin').eq('auth_user_id', user.id).single()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
  if (buyer.is_admin) return NextResponse.json({ error: 'Contas de administrador não podem ser excluídas pelo app.' }, { status: 403 })

  // Anonimiza PII + desativa
  try {
    await db.from('buyers').update({
      is_active: false,
      name: 'Conta excluída',
      email: `deleted-${buyer.id}@deleted.local`,
      phone: null,
      whatsapp: null,
    }).eq('id', buyer.id)
  } catch (e) { console.error('[account/delete] anonymize:', (e as any)?.message) }

  // Exclusão real do usuário de auth — o login deixa de existir
  try { await db.auth.admin.deleteUser(user.id) } catch (e) { console.error('[account/delete] auth:', (e as any)?.message) }

  return NextResponse.json({ success: true })
}
