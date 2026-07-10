import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { createVoiceAccessToken, voiceConfigured } from '@/lib/voice'

export const dynamic = 'force-dynamic'

/** GET /api/voice/token — AccessToken de voz pro buyer logado (softphone no navegador). */
export async function GET() {
  if (!voiceConfigured()) {
    return NextResponse.json({ error: 'Voz não configurada (env Twilio)' }, { status: 503 })
  }
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = createVoiceAccessToken(caller.id)
  return NextResponse.json({ token, identity: caller.id })
}
