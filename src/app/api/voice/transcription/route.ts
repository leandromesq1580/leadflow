import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/voice/transcription — webhook da transcrição AO VIVO do Twilio
 * (<Start><Transcription> no TwiML de saída, ligado por conta em
 * settings.call_transcription — teste da Fase 2 do roteiro, 2026-08-08).
 *
 * Eventos: transcription-started / -content / -stopped / -error. O -content traz
 * TranscriptionData (JSON com o texto) + Track: inbound_track é a voz do ATENDENTE
 * (o que o Twilio recebe do navegador), outbound_track é a do CLIENTE.
 *
 * Fase de teste: as falas são acumuladas em settings key `call_transcript:<CallSid>`
 * (uma ligação escreve em série — sem corrida real; medir qualidade pt-BR e custo
 * antes de qualquer UI). Sempre responde 200: transcrição nunca derruba chamada.
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text()
    const p = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>
    const evento = p.TranscriptionEvent || ''
    const callSid = p.CallSid || ''
    if (!callSid) return NextResponse.json({ ok: true })

    const db = createAdminClient()
    const chave = `call_transcript:${callSid}`
    const { data } = await db.from('settings').select('value').eq('key', chave).maybeSingle()
    const atual = ((data?.value as any) || { linhas: [], meta: {} }) as {
      linhas: { quem: string; texto: string; t: string }[]
      meta: Record<string, unknown>
    }

    if (evento === 'transcription-content') {
      let texto = ''
      try { texto = JSON.parse(p.TranscriptionData || '{}').transcript || '' } catch {}
      if (texto.trim()) {
        atual.linhas.push({
          quem: p.Track === 'inbound_track' ? 'atendente' : 'cliente',
          texto: texto.trim(),
          t: p.Timestamp || new Date().toISOString(),
        })
        // teto de segurança: ligação muito longa não vira um JSONB gigante
        if (atual.linhas.length > 400) atual.linhas = atual.linhas.slice(-400)
      }
    } else {
      atual.meta[evento || 'evento'] = p.Timestamp || new Date().toISOString()
      if (evento === 'transcription-error') {
        atual.meta.erro = `${p.TranscriptionErrorCode || ''} ${p.TranscriptionError || ''}`.trim()
        console.error('[voice/transcription] erro:', atual.meta.erro, 'call', callSid)
      }
    }

    atual.meta.buyer_id = p.buyer_id || new URL(request.url).searchParams.get('buyer_id') || atual.meta.buyer_id
    atual.meta.lead_id = new URL(request.url).searchParams.get('lead_id') || atual.meta.lead_id

    await db.from('settings').upsert(
      { key: chave, value: atual, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  } catch (e: any) {
    console.error('[voice/transcription]', e?.message)
  }
  return NextResponse.json({ ok: true })
}
