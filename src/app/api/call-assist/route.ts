import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer, canActAs } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/call-assist?call=<CallSid> — o painel de roteiro consulta durante a
 * ligação: em que etapa a IA acha que a conversa está + a sugestão do momento.
 * Só o dono da ligação (ou admin) lê. Sem transcrição/sugestão ainda → campos nulos
 * (o painel segue manual, como na Fase 1).
 */
export async function GET(request: NextRequest) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const callSid = (new URL(request.url).searchParams.get('call') || '').trim()
  if (!/^CA[a-zA-Z0-9]{10,}$/.test(callSid)) return NextResponse.json({ assist: null })

  try {
    const { data } = await db.from('settings').select('value').eq('key', `call_transcript:${callSid}`).maybeSingle()
    const v = (data?.value as any)
    if (!v) return NextResponse.json({ assist: null })
    const dono = String(v.meta?.buyer_id || '')
    if (dono && !canActAs(caller, dono)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

    return NextResponse.json({
      assist: v.assist || null,
      ouvindo: !v.meta?.['transcription-stopped'],
      falas: Array.isArray(v.linhas) ? v.linhas.length : 0,
    })
  } catch {
    return NextResponse.json({ assist: null })
  }
}
