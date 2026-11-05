import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'

/** PUT {enabled:boolean} — chave geral do SMS automático pós-ligação do comprador logado. */
export async function PUT(request: NextRequest) {
  const db = createAdminClient()
  const me = await callerBuyer(db)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const input = await request.json().catch(() => null)
  if (!input || typeof input.enabled !== 'boolean') return NextResponse.json({ error: 'Invalid enabled' }, { status: 400 })
  const { error } = await db.from('buyers').update({ sms_auto_enabled: input.enabled }).eq('id', me.id)
  if (error) return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })
  return NextResponse.json({ enabled: input.enabled })
}
