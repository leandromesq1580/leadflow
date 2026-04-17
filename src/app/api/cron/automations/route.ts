import { NextRequest, NextResponse } from 'next/server'
import { runAutomations } from '@/lib/automation-engine'

/** GET /api/cron/automations — scheduled runner, protected by ?secret= */
export async function GET(request: NextRequest) {
  const secret = new URL(request.url).searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runAutomations()
  console.log(`[Cron Automations] ran=${result.ran} failed=${result.failed}`)
  return NextResponse.json(result)
}
