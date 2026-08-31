import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { getQueuePosition } from '@/lib/queue-position'
import { isLeadLanguage } from '@/lib/lead-language'

export const dynamic = 'force-dynamic'

/** GET /api/queue-position — posição do comprador logado na fila de leads, por estado. */
export async function GET(request: Request) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const language = new URL(request.url).searchParams.get('language') || 'pt'
  if (!isLeadLanguage(language)) return NextResponse.json({ error: 'Idioma inválido.' }, { status: 400 })
  try {
    const data = await getQueuePosition(db, caller.id, language)
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[queue-position]', e?.message)
    return NextResponse.json({ error: 'Não consegui calcular a fila agora.' }, { status: 500 })
  }
}
