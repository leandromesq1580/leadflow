import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateAdminRule } from '@/lib/admin-rule'
import { readAdminRuleState } from '@/lib/admin-rule-state'

/**
 * GET /api/admin/admin-rule-preview?secret=...&states=FL,TX,CA
 * Preview/teste da Regra do Administrador em DRY-RUN: mostra qual admin PEGARIA
 * um lead de cada estado, SEM atribuir nem notificar ninguém. Lê a regra salva
 * em settings.lead_routing.admin_rule. Secret-gated (POLL_SECRET).
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'lead4producers-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data: lr } = await supabase.from('settings').select('value').eq('key', 'lead_routing').maybeSingle()
  let rule = (lr?.value as any)?.admin_rule || null
  // Override SÓ pro dry-run (não grava nada): ?n=N testa um "1 a cada N" diferente
  // do salvo, sem mexer na config de produção.
  const nOverride = url.searchParams.get('n')
  if (nOverride != null && rule) rule = { ...rule, one_in: parseInt(nOverride) || 0 }

  const states = (url.searchParams.get('states') || 'FL,TX,CA,NY,WY').split(',').map(s => s.trim()).filter(Boolean)
  const snapshot = await readAdminRuleState(supabase, rule)
  const results: any[] = []
  for (const st of states) {
    const decision = evaluateAdminRule(rule, snapshot.assignedCount, snapshot.candidates, st)
    const picked = decision.eligible ? decision.candidate : null
    results.push({
      state: st,
      picked: picked
        ? { name: picked.name, email: picked.email, every_n: decision.N, position: decision.position, next_is_admin_turn: decision.isTurn }
        : null,
      blocked_reason: decision.blockedReason,
      daily_max: rule?.daily_max ?? null,
      received_today: decision.candidate?.receivedToday ?? null,
    })
  }

  return NextResponse.json({ rule, results, note: 'dry-run: nada foi atribuído nem notificado' }, { headers: { 'Cache-Control': 'private, no-store' } })
}
