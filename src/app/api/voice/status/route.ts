import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const emptyTwiml = () =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', { headers: { 'Content-Type': 'text/xml' } })

/**
 * POST /api/voice/status — callback de status da chamada (Dial action + Number events).
 * Faz upsert best-effort em `calls`. Se a migration ainda não rodou, só ignora.
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const buyerId = url.searchParams.get('buyer_id') || null
    const leadId = url.searchParams.get('lead_id') || null
    const p = Object.fromEntries(new URLSearchParams(await request.text())) as Record<string, string>

    const callSid = p.CallSid || p.DialCallSid || null
    if (callSid) {
      const status = p.DialCallStatus || p.CallStatus || null
      const duration = parseInt(p.DialCallDuration || p.CallDuration || '0', 10) || 0
      const row: Record<string, unknown> = {
        call_sid: callSid,
        buyer_id: buyerId,
        lead_id: leadId,
        from_number: p.From || null,
        to_number: p.To || null,
        status,
        duration_sec: duration,
      }
      const db = createAdminClient()
      try {
        await db.from('calls').upsert(row, { onConflict: 'call_sid' })
      } catch {
        // tabela `calls` ainda não migrada — ignora (piloto tolerante)
      }
    }
  } catch (e: any) {
    console.warn('[voice/status]', e?.message)
  }
  return emptyTwiml()
}
