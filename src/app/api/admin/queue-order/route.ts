import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateLeadRouting } from '@/lib/lead-routing-settings'

/**
 * POST /api/admin/queue-order  { order: 'credito'|'antiguidade'|'hibrido'|'rodizio' }
 * Salva a regra de ordenação da fila em settings.lead_routing.queue_order (admin).
 * A distribuição (distribute.ts) e a tela (delivery-queue) leem essa chave.
 */
export const dynamic = 'force-dynamic'
const VALID = ['credito', 'antiguidade', 'hibrido', 'rodizio']

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const order = String(body.order || '')
  if (!VALID.includes(order)) return NextResponse.json({ error: 'Invalid order' }, { status: 400 })

  try {
    await updateLeadRouting(db, current => ({ ...current, queue_order: order }))
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar a ordem.' }, { status: 503 })
  }
  return NextResponse.json({ ok: true, order })
}
