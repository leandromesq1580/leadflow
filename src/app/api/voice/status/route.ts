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

    // 🤖 AUTO-CLASSIFICAÇÃO do follow-up da ligação (2026-07-23): o softphone grava
    // "📞 Ligou — resultado pendente" na saída da chamada; aqui os callbacks do Twilio
    // completam sozinhos: AMD (AnsweredBy) diz humano×caixa postal; o action do Dial
    // (DialCallStatus) diz não-atendeu/ocupado/completou + duração. NUNCA sobrescreve
    // classificação manual — só mexe em follow-up ainda "pendente" ou "(auto)".
    const answeredBy = p.AnsweredBy || null
    const dialStatus = p.DialCallStatus || null
    if (leadId && (answeredBy || dialStatus)) {
      try {
        const db = createAdminClient()
        let q = db.from('follow_ups').select('id, description')
          .eq('lead_id', leadId).eq('type', 'call')
          .order('created_at', { ascending: false }).limit(1)
        if (buyerId) q = q.eq('buyer_id', buyerId)
        const { data: fus } = await q
        const fu = (fus || [])[0]
        const touchable = fu && /resultado pendente|\(auto\)/.test(fu.description || '')
        if (fu && touchable) {
          const dur = parseInt(p.DialCallDuration || '0', 10) || 0
          const durTxt = dur > 0 ? ` (${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')})` : ''
          let desc: string | null = null
          let final = false
          if (answeredBy) {
            if (answeredBy === 'human') desc = '📞 Ligação — Atendeu (auto)'
            else if (answeredBy.startsWith('machine') || answeredBy === 'fax') desc = '📞 Ligação — Caixa postal (auto)'
            // 'unknown' → deixa o callback final decidir
          } else if (dialStatus === 'no-answer') { desc = '📞 Ligação — Não atendeu (auto)'; final = true }
          else if (dialStatus === 'busy') { desc = '📞 Ligação — Não atendeu (ocupado) (auto)'; final = true }
          else if (dialStatus === 'failed' || dialStatus === 'canceled') { desc = '📞 Ligação — Não completou (auto)'; final = true }
          else if (dialStatus === 'completed') {
            final = true
            desc = (fu.description || '').includes('Caixa postal')
              ? `📞 Ligação${durTxt} — Caixa postal (auto)`
              : `📞 Ligação${durTxt} — Atendeu (auto)`
          }
          if (desc) {
            const upd: Record<string, unknown> = { description: desc }
            if (final) { upd.status = 'completed'; upd.completed_at = new Date().toISOString() }
            await db.from('follow_ups').update(upd).eq('id', fu.id)
          }
        }
      } catch (e: any) { console.warn('[voice/status] fu auto:', e?.message) }
    }
  } catch (e: any) {
    console.warn('[voice/status]', e?.message)
  }
  return emptyTwiml()
}
