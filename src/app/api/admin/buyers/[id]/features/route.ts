import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { buyerFeatureKey, isBuyerId, parseBuyerFeatureChange, readBuyerFeatures } from '@/lib/buyer-features'

export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ id: string }> }

async function access(id: string) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!caller.isAdmin) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  if (!isBuyerId(id)) return { response: NextResponse.json({ error: 'Usuário inválido.' }, { status: 400 }) }
  const { data, error } = await db.from('buyers').select('id').eq('id', id).maybeSingle()
  if (error) throw new Error('Storage unavailable')
  if (!data) return { response: NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 }) }
  return { db, caller }
}
export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { id } = await params
    const a = await access(id)
    if (a.response) return a.response
    return NextResponse.json({ features: await readBuyerFeatures(a.db!, id) })
  } catch { return NextResponse.json({ error: 'Não foi possível consultar os recursos.' }, { status: 503 }) }
}
export async function POST(request: NextRequest, { params }: Context) {
  try {
    const { id } = await params
    const a = await access(id)
    if (a.response) return a.response
    const change = parseBuyerFeatureChange(await request.json().catch(() => null))
    if (!change) return NextResponse.json({ error: 'Recurso ou permissão inválidos.' }, { status: 400 })
    const updatedAt = new Date().toISOString()
    // Per-buyer, per-feature key: no read/replace of a shared list, no billing changes.
    const { error } = await a.db!.from('settings').upsert({
      key: buyerFeatureKey(change.feature, id),
      value: { mode: change.mode, updated_by: a.caller!.id, updated_at: updatedAt },
      updated_at: updatedAt,
    }, { onConflict: 'key' })
    if (error) throw new Error('Storage unavailable')
    const features = await readBuyerFeatures(a.db!, id)
    if (features.find(f => f.id === change.feature)?.mode !== change.mode) {
      return NextResponse.json({ error: 'A permissão foi alterada em outra sessão. Atualize e confira.' }, { status: 409 })
    }
    return NextResponse.json({ features })
  } catch { return NextResponse.json({ error: 'Não foi possível confirmar a alteração. Atualize e confira antes de tentar novamente.' }, { status: 503 }) }
}
