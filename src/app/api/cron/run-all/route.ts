import { NextRequest, NextResponse } from 'next/server'
import { processSequences } from '@/lib/sequence-engine'
import { runAutomations } from '@/lib/automation-engine'
import { createAdminClient } from '@/lib/supabase/admin'
import { importarPortaisPendentes } from '@/lib/nl-sync'

export const maxDuration = 300

/**
 * GET /api/cron/run-all?secret=X
 *
 * Segundo slot de cron: dispara sequences + automations + reminders.
 * O primeiro slot permanece dedicado à captura dos leads do Meta.
 * Sem dependencia externa (cron-job.org etc).
 *
 * NAO modifica os 3 cron endpoints existentes — eles continuam funcionando
 * standalone se chamados via curl.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  const headerSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const expected = (process.env.POLL_SECRET || 'lead4producers-poll-2026').trim()
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  const isVercelCron = request.headers.get('user-agent')?.includes('vercel-cron') ?? false

  const authorized =
    secret === expected ||
    headerSecret === expected ||
    (cronSecret && headerSecret === cronSecret) ||
    (isVercelCron && !headerSecret)

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const base = request.nextUrl.origin
  const startedAt = Date.now()

  const [seqResult, autoResult, remResult, policyResult] = await Promise.allSettled([
    processSequences(),
    runAutomations(),
    fetch(`${base}/api/cron/reminders?secret=${expected}`, {
      headers: { 'user-agent': 'run-all-orchestrator' },
    }).then(r => r.json()).catch(e => ({ error: String(e) })),
    importarPortaisPendentes(createAdminClient()),
  ])

  const result = {
    sequences: seqResult.status === 'fulfilled' ? seqResult.value : { error: String(seqResult.reason) },
    automations: autoResult.status === 'fulfilled' ? autoResult.value : { error: String(autoResult.reason) },
    reminders: remResult.status === 'fulfilled' ? remResult.value : { error: String(remResult.reason) },
    policies: policyResult.status === 'fulfilled' ? policyResult.value : { error: String(policyResult.reason) },
    duration_ms: Date.now() - startedAt,
  }

  console.log('[Cron run-all]', JSON.stringify(result))
  return NextResponse.json(result)
}
