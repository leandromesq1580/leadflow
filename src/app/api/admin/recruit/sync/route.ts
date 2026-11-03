import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { fetchNewLicensees, validateRange } from '@/lib/fl-licensees'
import { guessLanguage } from '@/lib/recruit-agents'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * POST /api/admin/recruit/sync  body {from,to}
 * Busca no DFS e guarda os agentes no recrutamento (idempotente por e-mail: não mexe em status/notas de quem já existe).
 * Não envia nada para ninguém.
 */
export async function POST(request: NextRequest) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Entre novamente na sua conta.' }, { status: 401, headers: NO_STORE })
  if (!caller.isAdmin) return NextResponse.json({ error: 'Apenas administradores.' }, { status: 403, headers: NO_STORE })
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Origem inválida.' }, { status: 403, headers: NO_STORE })

  const body = await request.json().catch(() => ({}))
  const range = validateRange(body?.from, body?.to)
  if (!range.ok) return NextResponse.json({ error: range.error }, { status: 400, headers: NO_STORE })
  try {
    const list = await fetchNewLicensees(range.from, range.to)
    let inserted = 0, received = 0
    for (let i = 0; i < list.length; i += 500) {
      const chunk = list.slice(i, i + 500).filter(a => a.email).map(a => ({ ...a, language: guessLanguage(a.name) }))
      const { data, error } = await db.rpc('rc_import', { p_rows: chunk })
      if (error) throw new Error('Não consegui gravar os agentes no banco.')
      inserted += Number((data as { inserted?: number })?.inserted || 0)
      received += chunk.length
    }
    return NextResponse.json({ from: range.from, to: range.to, found: list.length, saved: received, inserted, alreadyKnown: received - inserted }, { headers: NO_STORE })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao importar.' }, { status: 502, headers: NO_STORE })
  }
}
