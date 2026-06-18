import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tryAdminRule } from '@/lib/distribute'

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
  // Override de cota SÓ pro dry-run (não grava nada): permite testar o cap sem
  // mexer na config de produção. ?quota=N substitui daily_quota só nesta resposta.
  const qOverride = url.searchParams.get('quota')
  if (qOverride != null && rule) rule = { ...rule, daily_quota: parseInt(qOverride) || 0 }

  const states = (url.searchParams.get('states') || 'FL,TX,CA,NY,WY').split(',').map(s => s.trim()).filter(Boolean)
  const results: any[] = []
  for (const st of states) {
    const fakeLead: any = { id: `preview-${st}`, state: st, meta_lead_id: `preview-${st}`, name: 'PREVIEW', phone: '', status: 'new' }
    const picked = await tryAdminRule(fakeLead, rule, true)
    results.push({
      state: st,
      picked: picked
        ? { name: (picked as any).name, email: (picked as any).email, today: (picked as any)._today, quota: (picked as any)._quota }
        : null,
    })
  }

  return NextResponse.json({ rule, results, note: 'dry-run: nada foi atribuído nem notificado' })
}
