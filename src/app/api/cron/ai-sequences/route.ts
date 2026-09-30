import { NextRequest, NextResponse } from 'next/server'
import { processSequences } from '@/lib/sequence-engine'

export const maxDuration = 300

/** Minute polling, not an exact timer. SQL leases guard overlapping runs and inline dispatch. */
export async function GET(request: NextRequest) {
  const secret = (process.env.CRON_SECRET || '').trim()
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await processSequences({ mode: 'ai_until_reply' })
  return NextResponse.json(result)
}
