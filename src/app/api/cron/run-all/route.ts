import { NextRequest, NextResponse } from 'next/server'
import { processSequences } from '@/lib/sequence-engine'
import { runAutomations } from '@/lib/automation-engine'

/**
 * GET /api/cron/run-all?secret=X
 *
 * Orquestrador unico que dispara sequences + automations + reminders.
 * Existe pra caber em 1 slot de cron do Vercel Hobby (limite: 2 crons).
 * Sem dependencia externa (cron-job.org etc).
 *
 * NAO modifica os 3 cron endpoints existentes — eles continuam funcionando
 * standalone se chamados via curl.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  const headerSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const expected = (process.env.POLL_SECRET || 'leadflow-poll-2026').trim()
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

  const [seqResult, autoResult, remResult] = await Promise.allSettled([
    processSequences(),
    runAutomations(),
    fetch(`${base}/api/cron/reminders?secret=${expected}`, {
      headers: { 'user-agent': 'run-all-orchestrator' },
    }).then(r => r.json()).catch(e => ({ error: String(e) })),
  ])

  const result = {
    sequences: seqResult.status === 'fulfilled' ? seqResult.value : { error: String(seqResult.reason) },
    automations: autoResult.status === 'fulfilled' ? autoResult.value : { error: String(autoResult.reason) },
    reminders: remResult.status === 'fulfilled' ? remResult.value : { error: String(remResult.reason) },
    duration_ms: Date.now() - startedAt,
  }

  console.log('[Cron run-all]', JSON.stringify(result))
  return NextResponse.json(result)
}
