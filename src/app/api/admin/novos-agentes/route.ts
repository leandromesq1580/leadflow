import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { fetchNewLicensees, licenseesToCsv, validateRange } from '@/lib/fl-licensees'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * GET /api/admin/novos-agentes?from=2026-10-26&to=2026-11-02[&format=csv]
 * Agentes com licença Life & Annuity emitida no período (fonte: Florida DFS). Só admin; somente leitura.
 */
export async function GET(request: NextRequest) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Entre novamente na sua conta.' }, { status: 401, headers: NO_STORE })
  if (!caller.isAdmin) return NextResponse.json({ error: 'Apenas administradores.' }, { status: 403, headers: NO_STORE })

  const sp = request.nextUrl.searchParams
  const range = validateRange(sp.get('from'), sp.get('to'))
  if (!range.ok) return NextResponse.json({ error: range.error }, { status: 400, headers: NO_STORE })

  try {
    const list = await fetchNewLicensees(range.from, range.to)
    if (sp.get('format') === 'csv') {
      return new NextResponse(licenseesToCsv(list), {
        headers: {
          ...NO_STORE,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="novos-agentes-${range.from}_a_${range.to}.csv"`,
        },
      })
    }
    return NextResponse.json({ from: range.from, to: range.to, total: list.length, agents: list, fetchedAt: new Date().toISOString() }, { headers: NO_STORE })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao consultar o DFS.' }, { status: 502, headers: NO_STORE })
  }
}
