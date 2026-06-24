import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  const { data: cur } = await db.from('settings').select('value').eq('key', 'lead_routing').maybeSingle()
  const value = { ...((cur?.value as any) || {}), queue_order: order }
  const { error } = await db.from('settings').upsert(
    { key: 'lead_routing', value, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, order })
}
