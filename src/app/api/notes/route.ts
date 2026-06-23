import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET/PUT /api/notes — Bloco de Notas & Checklists por comprador.
 * Persiste em settings (key = `user_notes:<buyerId>`, value = { blocks }) via
 * service-role — sem migração de banco. O cliente nunca toca em settings direto.
 */
export const dynamic = 'force-dynamic'

const LICENSE_ITEMS = [
  'Reunião Academia da licença', 'Começou o Curso', 'Simulado', 'Marcou Prova',
  'Fingerprint', 'Passou Prova', 'E&O', 'Appointment NLG',
]

function defaultBlocks() {
  const now = Date.now()
  return [{
    id: `lic-${now}`,
    title: 'Licença',
    notes: '',
    items: LICENSE_ITEMS.map((label, i) => ({ id: `it-${now}-${i}`, label, done: false })),
  }]
}

async function getBuyerId(): Promise<string | null> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id').eq('auth_user_id', user.id).single()
  return buyer?.id || null
}

export async function GET() {
  const buyerId = await getBuyerId()
  if (!buyerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  const { data } = await db.from('settings').select('value').eq('key', `user_notes:${buyerId}`).maybeSingle()
  const blocks = (data?.value as any)?.blocks
  return NextResponse.json({ blocks: Array.isArray(blocks) ? blocks : defaultBlocks() })
}

export async function PUT(request: NextRequest) {
  const buyerId = await getBuyerId()
  if (!buyerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const raw = Array.isArray(body.blocks) ? body.blocks : []
  // Sanitiza + limita tamanhos (evita abuso/JSON gigante)
  const blocks = raw.slice(0, 100).map((b: any) => ({
    id: String(b?.id || '').slice(0, 64) || `b-${Date.now()}`,
    title: String(b?.title || '').slice(0, 200),
    notes: String(b?.notes || '').slice(0, 20000),
    items: (Array.isArray(b?.items) ? b.items : []).slice(0, 300).map((it: any) => ({
      id: String(it?.id || '').slice(0, 64) || `i-${Date.now()}`,
      label: String(it?.label || '').slice(0, 300),
      done: !!it?.done,
    })),
  }))
  const db = createAdminClient()
  const { error } = await db.from('settings').upsert(
    { key: `user_notes:${buyerId}`, value: { blocks }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
