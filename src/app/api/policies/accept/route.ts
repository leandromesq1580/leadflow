import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { CURRENT_POLICY_VERSION, hasAcceptedCurrentPolicy, recordPolicyAcceptance } from '@/lib/policies'

export const dynamic = 'force-dynamic'

/** GET /api/policies/accept — status do aceite do buyer logado (pra UI decidir o checkbox). */
export async function GET() {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accepted = await hasAcceptedCurrentPolicy(db, caller.id)
  return NextResponse.json({ accepted, version: CURRENT_POLICY_VERSION })
}

/** POST /api/policies/accept — registra o aceite (clickwrap) do buyer logado. */
export async function POST(request: NextRequest) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { context } = await request.json().catch(() => ({ context: 'manual' }))
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const ua = request.headers.get('user-agent')
  const r = await recordPolicyAcceptance(db, caller.id, String(context || 'manual').slice(0, 40), ip, ua)
  if (!r.ok && r.needsMigration) {
    // migration 033 pendente — não trava o cliente; o gate também está inerte
    return NextResponse.json({ ok: true, pending_migration: true, version: CURRENT_POLICY_VERSION })
  }
  if (!r.ok) return NextResponse.json({ error: r.error || 'Falha ao registrar aceite' }, { status: 500 })
  return NextResponse.json({ ok: true, version: CURRENT_POLICY_VERSION })
}
