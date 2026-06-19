import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/delivery-queue — Fila de entregas (ordem real da distribuição).
 * Usa o MESMO RPC que a distribuição (get_eligible_buyers: mais crédito primeiro,
 * empate pela compra mais antiga). Retorna posição, nome, créditos a receber e
 * estados em que o comprador está apto. Admin-gated.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: elig } = await db.rpc('get_eligible_buyers', { p_product_type: 'lead', p_state: null })
  // RPC já vem ordenado pela prioridade. Colapsa múltiplas linhas de crédito por comprador
  // (mantém a 1ª aparição = posição na fila, soma o saldo).
  const seen = new Map<string, { id: string; name: string; credits: number }>()
  for (const e of (elig || [])) {
    const cur = seen.get(e.id)
    if (cur) { cur.credits += Number(e.remaining) || 0; continue }
    seen.set(e.id, { id: e.id, name: (e.name || '').trim(), credits: Number(e.remaining) || 0 })
  }
  const queue = [...seen.values()]
  const ids = queue.map(q => q.id)
  const statesByBuyer: Record<string, string[]> = {}
  if (ids.length) {
    const { data: st } = await db.from('buyer_states').select('buyer_id, state_code').in('buyer_id', ids)
    for (const s of (st || [])) (statesByBuyer[s.buyer_id] ||= []).push(s.state_code)
  }
  const fila = queue.map((q, i) => ({ pos: i + 1, id: q.id, nome: q.name, creditos: q.credits, estados: (statesByBuyer[q.id] || []).sort() }))
  return NextResponse.json({ total: fila.length, fila })
}
