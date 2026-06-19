import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Tabelas-filho que referenciam buyers(id) por buyer_id. Limpas antes de remover o
// comprador (as FKs têm regras de cascade mistas; não dá pra confiar só no cascade).
const CHILD_TABLES = [
  'appointments', 'buyer_availability', 'buyer_states', 'credits', 'follow_ups',
  'lead_activity', 'notification_preferences', 'payments', 'push_subscriptions',
  'tags', 'team_members', 'whatsapp_messages', 'calendar_items',
]

/**
 * POST /api/admin/buyers/[id]/delete — apaga um comprador de vez.
 * - Bloqueia apagar admin ou a si mesmo (use Suspender pra esses).
 * - Preserva os LEADS (desatribui assigned_to → null, não apaga histórico do sistema).
 * - Limpa as tabelas-filho, apaga o comprador e remove o login (auth user).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminDb = createAdminClient()
  const { data: me } = await adminDb.from('buyers').select('id, is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: target } = await adminDb.from('buyers').select('id, is_admin, auth_user_id, name').eq('id', id).single()
  if (!target) return NextResponse.json({ error: 'Comprador não encontrado' }, { status: 404 })
  if (target.is_admin) return NextResponse.json({ error: 'Não dá pra apagar um administrador. Suspenda em vez disso.' }, { status: 400 })
  if (target.id === me.id) return NextResponse.json({ error: 'Você não pode apagar a si mesmo.' }, { status: 400 })

  // 1) Preserva os leads: desatribui (leads são dado do sistema, não somem com o comprador).
  await adminDb.from('leads').update({ assigned_to: null }).eq('assigned_to', id)
  // 2) Pipelines do comprador (cascateia stages / pipeline_leads).
  await adminDb.from('pipelines').delete().eq('buyer_id', id)
  // 3) Referrals (várias colunas apontam pra buyers) + quem foi indicado por ele.
  for (const col of ['referrer_buyer_id', 'referred_buyer_id', 'client_buyer_id']) {
    const { error } = await adminDb.from('referrals').delete().eq(col, id)
    if (error && !/does not exist/i.test(error.message)) console.warn(`[delete-buyer] referrals.${col}:`, error.message)
  }
  await adminDb.from('buyers').update({ referred_by: null }).eq('referred_by', id)
  // 4) Demais tabelas-filho (best-effort; tabela/coluna ausente não interrompe).
  for (const t of CHILD_TABLES) {
    const { error } = await adminDb.from(t).delete().eq('buyer_id', id)
    if (error && !/does not exist/i.test(error.message)) console.warn(`[delete-buyer] ${t}:`, error.message)
  }
  // 5) Remove o comprador.
  const { error: delErr } = await adminDb.from('buyers').delete().eq('id', id)
  if (delErr) return NextResponse.json({ error: 'Falha ao apagar (referência pendente): ' + delErr.message }, { status: 500 })
  // 6) Remove o login. Best-effort — comprador já foi.
  if (target.auth_user_id) {
    try { await adminDb.auth.admin.deleteUser(target.auth_user_id) } catch (e) { console.warn('[delete-buyer] auth user:', (e as any)?.message) }
  }

  return NextResponse.json({ success: true, name: target.name })
}
