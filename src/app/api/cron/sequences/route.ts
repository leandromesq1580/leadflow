import { NextRequest, NextResponse } from 'next/server'
import { processSequences } from '@/lib/sequence-engine'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET || 'dev'}`
  if (auth !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await processSequences()
  console.log(`[Cron Sequences] processed=${result.processed} failed=${result.failed}`)
  return NextResponse.json(result)
}
