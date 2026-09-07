import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
// Gravação longa (dezenas de MB): baixar do Twilio + subir no Storage não cabe no default.
export const maxDuration = 300

function env(name: string): string {
  return (process.env[name] || '').trim().replace(/\\n/g, '')
}

/**
 * POST /api/admin/voice/recover?lead_id=…  (header x-diag-secret)
 *
 * Rede de segurança para quando o callback `recordingStatusCallback` do Twilio não
 * chega (visto em 07/09/2026 numa ligação de 43 min): varre as chamadas do lead,
 * pergunta ao Twilio quais gravações existem e anexa as que faltam — mesma regra
 * da rota /api/voice/recording (bucket privado + lead_attachments).
 */
export async function POST(request: NextRequest) {
  const secret = env('DIAG_SECRET')
  if (!secret || request.headers.get('x-diag-secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const url = new URL(request.url)
  const leadId = url.searchParams.get('lead_id')
  if (!leadId) return NextResponse.json({ error: 'lead_id obrigatório' }, { status: 400 })

  const sid = env('TWILIO_ACCOUNT_SID')
  const token = env('TWILIO_AUTH_TOKEN')
  const diag: Record<string, unknown> = { lead_id: leadId, twilio_sid_present: !!sid, twilio_token_present: !!token }
  if (!sid || !token) return NextResponse.json({ ...diag, error: 'sem credenciais Twilio' }, { status: 500 })
  const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')
  const api = async (path: string) => {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, { headers: { Authorization: auth } })
    return { status: r.status, body: await r.json().catch(() => ({})) as any }
  }

  const db = createAdminClient()
  const { data: calls } = await db.from('calls').select('call_sid, buyer_id, duration_sec, status, created_at')
    .eq('lead_id', leadId).order('created_at', { ascending: false }).limit(20)

  const sids = new Set<string>((calls || []).map(c => c.call_sid).filter(Boolean))
  // pernas filhas (o Dial grava na perna pai, mas varremos as duas)
  for (const s of [...sids]) {
    const kids = await api(`/Calls.json?ParentCallSid=${s}&PageSize=20`)
    for (const k of (kids.body.calls || [])) sids.add(k.sid)
  }

  const encontradas: any[] = []
  for (const s of sids) {
    const r = await api(`/Calls/${s}/Recordings.json?PageSize=20`)
    for (const rec of (r.body.recordings || [])) encontradas.push({ call_sid: s, sid: rec.sid, duration: rec.duration, status: rec.status, date: rec.date_created })
  }
  diag.chamadas = [...sids]
  diag.gravacoes_no_twilio = encontradas

  const anexadas: string[] = []
  for (const rec of encontradas) {
    if (rec.status && rec.status !== 'completed') continue
    const filePath = `recordings/${leadId}/${rec.sid}.mp3`
    const { data: dupe } = await db.from('lead_attachments').select('id').eq('file_path', filePath).maybeSingle()
    if (dupe) { anexadas.push(`${rec.sid} (já existia)`); continue }
    const audio = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings/${rec.sid}.mp3`, { headers: { Authorization: auth } })
    if (!audio.ok) { anexadas.push(`${rec.sid} ERRO download ${audio.status}`); continue }
    const buf = Buffer.from(await audio.arrayBuffer())
    const { error: upErr } = await db.storage.from('lead-attachments').upload(filePath, buf, { contentType: 'audio/mpeg', upsert: true })
    if (upErr) { anexadas.push(`${rec.sid} ERRO storage ${upErr.message}`); continue }
    const durSec = parseInt(String(rec.duration || '0'), 10) || 0
    const durTxt = durSec > 0 ? ` (${Math.floor(durSec / 60)}m${String(durSec % 60).padStart(2, '0')}s)` : ''
    const when = new Date(rec.date || Date.now()).toLocaleString('pt-BR', { timeZone: 'America/New_York', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    const buyerId = (calls || []).find(c => c.call_sid === rec.call_sid)?.buyer_id || (calls || [])[0]?.buyer_id || null
    const { error: insErr } = await db.from('lead_attachments').insert({
      lead_id: leadId, buyer_id: buyerId,
      file_name: `Gravação da ligação ${when}${durTxt}.mp3`,
      file_path: filePath, file_size: buf.length, file_type: 'audio/mpeg',
    })
    anexadas.push(insErr ? `${rec.sid} ERRO insert ${insErr.message}` : `${rec.sid} ANEXADA ${(buf.length / 1048576).toFixed(1)}MB${durTxt}`)
  }
  return NextResponse.json({ ...diag, anexadas })
}
