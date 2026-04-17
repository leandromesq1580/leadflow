import { NextRequest, NextResponse } from 'next/server'
import { runAutomations } from '@/lib/automation-engine'

/** GET /api/cron/automations — scheduled runner, protected by CRON_SECRET */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET || 'dev'}`
  if (authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runAutomations()
  console.log(`[Cron Automations] ran=${result.ran} failed=${result.failed}`)
  return NextResponse.json(result)
}
