import { NextRequest, NextResponse } from 'next/server'
import { processSequences } from '@/lib/sequence-engine'

/** GET /api/cron/sequences — scheduled runner, protected by ?secret= */
export async function GET(request: NextRequest) {
  const secret = new URL(request.url).searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await processSequences()
  console.log(`[Cron Sequences] processed=${result.processed} failed=${result.failed}`)
  return NextResponse.json(result)
}
