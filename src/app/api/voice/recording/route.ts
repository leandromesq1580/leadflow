import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const ok = () =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', { headers: { 'Content-Type': 'text/xml' } })

function env(name: string): string {
  return (process.env[name] || '').trim().replace(/\\n/g, '')
}

/**
 * POST /api/voice/recording — callback do Twilio quando a gravação da ligação fica
 * pronta (Dial record + recordingStatusCallback). Fluxo (2026-07-24, gravar TODAS):
 *  1. Baixa o MP3 do Twilio (basic auth SID:TOKEN).
 *  2. Sobe pro bucket PRIVADO lead-attachments (recordings/{leadId}/{sid}.mp3) —
 *     o download na UI já sai por URL assinada de 5min (rota de anexos existente).
 *  3. Registra em lead_attachments → aparece na aba ANEXOS do lead.
 *  4. Best-effort: apaga a cópia no Twilio (uma cópia só, no nosso Storage).
 * Idempotente por RecordingSid (upsert no storage + dedup no insert).
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const buyerId = url.searchParams.get('buyer_id') || null
    const leadId = url.searchParams.get('lead_id') || null
    const p = Object.fromEntries(new URLSearchParams(await request.text())) as Record<string, string>

    const recSid = p.RecordingSid || ''
    const recUrl = p.RecordingUrl || ''
    const recStatus = p.RecordingStatus || 'completed'
    if (!recSid || !recUrl || recStatus !== 'completed' || !leadId) return ok()

    const sid = env('TWILIO_ACCOUNT_SID')
    const token = env('TWILIO_AUTH_TOKEN')
    if (!sid || !token) { console.warn('[voice/recording] sem credenciais Twilio'); return ok() }
    const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')

    const audio = await fetch(`${recUrl}.mp3`, { headers: { Authorization: auth } })
    if (!audio.ok) { console.warn('[voice/recording] download falhou:', audio.status); return ok() }
    const buf = Buffer.from(await audio.arrayBuffer())

    const db = createAdminClient()
    const filePath = `recordings/${leadId}/${recSid}.mp3`
    const { error: upErr } = await db.storage.from('lead-attachments')
      .upload(filePath, buf, { contentType: 'audio/mpeg', upsert: true })
    if (upErr) { console.warn('[voice/recording] upload storage:', upErr.message); return ok() }

    // Dedup: callback do Twilio pode reentregar
    const { data: dupe } = await db.from('lead_attachments').select('id').eq('file_path', filePath).maybeSingle()
    if (!dupe) {
      const durSec = parseInt(p.RecordingDuration || '0', 10) || 0
      const durTxt = durSec > 0 ? ` (${Math.floor(durSec / 60)}m${String(durSec % 60).padStart(2, '0')}s)` : ''
      // Data no fuso do Leste (onde estão os leads) só pra dar nome legível
      const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/New_York', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      const { error: insErr } = await db.from('lead_attachments').insert({
        lead_id: leadId,
        buyer_id: buyerId,
        file_name: `Gravação da ligação ${when}${durTxt}.mp3`,
        file_path: filePath,
        file_size: buf.length,
        file_type: 'audio/mpeg',
      })
      if (insErr) console.warn('[voice/recording] insert attachment:', insErr.message)
      else console.log(`[voice/recording] gravação ${recSid} anexada ao lead ${leadId}${durTxt}`)
    }

    // Uma cópia só: remove do Twilio (best-effort — se falhar, fica lá, sem drama)
    try {
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings/${recSid}.json`, {
        method: 'DELETE', headers: { Authorization: auth },
      })
    } catch {}
  } catch (e: any) {
    console.warn('[voice/recording]', e?.message)
  }
  return ok()
}
