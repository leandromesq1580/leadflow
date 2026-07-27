import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSms, toE164 } from '@/lib/twilio'
import { buyerTimezone } from '@/lib/availability'

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
          // CORRIDA (2026-07-27): o AMD é assíncrono e pode chegar DEPOIS do callback
          // final — e ele não traz duração. Preserva a duração que já estiver escrita
          // no follow-up pra não apagar o tempo da ligação.
          const prevDur = ((fu.description || '').match(/\(\d+:\d{2}\)/) || [])[0]
          const durKeep = durTxt || (prevDur ? ` ${prevDur}` : '')
          let desc: string | null = null
          let final = false
          if (answeredBy) {
            if (answeredBy === 'human') desc = `📞 Ligação${durKeep} — Atendeu (auto)`
            else if (answeredBy.startsWith('machine') || answeredBy === 'fax') desc = `📞 Ligação${durKeep} — Caixa postal (auto)`
            // 'unknown' → deixa o callback final decidir
          } else if (dialStatus === 'no-answer') { desc = '📞 Ligação — Não atendeu (auto)'; final = true }
          else if (dialStatus === 'busy') { desc = '📞 Ligação — Não atendeu (ocupado) (auto)'; final = true }
          else if (dialStatus === 'failed' || dialStatus === 'canceled') { desc = '📞 Ligação — Não completou (auto)'; final = true }
          else if (dialStatus === 'completed') {
            final = true
            desc = (fu.description || '').includes('Caixa postal')
              ? `📞 Ligação${durKeep} — Caixa postal (auto)`
              : `📞 Ligação${durKeep} — Atendeu (auto)`
          }
          if (desc) {
            const upd: Record<string, unknown> = { description: desc }
            if (final) { upd.status = 'completed'; upd.completed_at = new Date().toISOString() }
            await db.from('follow_ups').update(upd).eq('id', fu.id)
          }

          // 📱 SMS AUTOMÁTICO pós-tentativa SEM CONTATO (decisão 2026-07-25): quando a
          // ligação termina sem falar com o lead (não atendeu / ocupado / caixa postal),
          // manda SMS "tentei te ligar" e registra follow-up — a trilha alimenta a
          // gestão de TROCA de leads. Regras: máx 1/dia e 14 no total por lead,
          // só 8h–21h no fuso do lead, respeita opt-out (STOP).
          if (final && desc && /Não atendeu|Caixa postal/.test(desc)) {
            try {
              const { data: leadRow } = await db.from('leads')
                .select('name, phone, state, sms_opted_out').eq('id', leadId).maybeSingle()
              const e164 = toE164(leadRow?.phone)
              if (leadRow && !leadRow.sms_opted_out && e164) {
                const tz = buyerTimezone(leadRow.state ? [leadRow.state] : null)
                const hourStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date())
                const hour = parseInt(hourStr, 10)
                const { data: prior } = await db.from('follow_ups')
                  .select('id, created_at').eq('lead_id', leadId)
                  .like('description', '📱 SMS auto%')
                const total = (prior || []).length
                const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz })
                const today = dayFmt.format(new Date())
                const sentToday = (prior || []).some(p => dayFmt.format(new Date(p.created_at as string)) === today)
                if (hour >= 8 && hour < 21 && total < 14 && !sentToday) {
                  let buyerName = ''
                  if (buyerId) {
                    const { data: b } = await db.from('buyers').select('name').eq('id', buyerId).maybeSingle()
                    buyerName = (b?.name || '').trim()
                  }
                  const first = String(leadRow.name || '').trim().split(/\s+/)[0]
                  const smsBody = `Oi${first ? ' ' + first : ''}! Aqui é ${buyerName || 'seu corretor'}. Tentei te ligar agora sobre sua cotação de seguro de vida, mas não consegui falar com você. Pode me retornar por aqui?`
                  const res = await sendSms(e164, smsBody)
                  if (res.ok) {
                    await db.from('sms_messages').insert({
                      lead_id: leadId, direction: 'out', to_phone: e164.replace(/\D/g, ''),
                      body: smsBody, status: 'sent', twilio_sid: res.sid || null,
                    })
                    await db.from('follow_ups').insert({
                      lead_id: leadId, buyer_id: buyerId, type: 'note',
                      description: `📱 SMS auto (${total + 1}/14) — tentativa de ligação sem contato`,
                      status: 'completed', completed_at: new Date().toISOString(),
                    })
                    console.log(`[voice/status] SMS auto ${total + 1}/14 -> lead ${leadId}`)
                  } else {
                    console.warn('[voice/status] SMS auto falhou:', res.error)
                  }
                }
              }
            } catch (e: any) { console.warn('[voice/status] sms auto:', e?.message) }
          }
        }
      } catch (e: any) { console.warn('[voice/status] fu auto:', e?.message) }
    }
  } catch (e: any) {
    console.warn('[voice/status]', e?.message)
  }
  return emptyTwiml()
}
