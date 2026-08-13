import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { avaliarConversa } from '@/lib/call-assist'

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
      // CONTADOR DE MINUTOS do add-on IA na Ligação: no fim da transcrição, soma a
      // duração (started→stopped) no mês corrente do buyer. Franquia é fair-use —
      // aqui só medimos; quem exibe e conversa upgrade é a página do Roteiro.
      if (evento === 'transcription-stopped' && atual.meta['transcription-started']) {
        try {
          const ini = new Date(String(atual.meta['transcription-started'])).getTime()
          const fim = new Date(String(p.Timestamp || Date.now())).getTime()
          const minutos = Math.max(0, Math.round((fim - ini) / 60_000))
          const bid = String(atual.meta.buyer_id || p.buyer_id || '')
          if (minutos > 0 && bid) {
            const mes = new Date().toISOString().slice(0, 7)
            const chaveUso = `ia_uso:${bid}:${mes}`
            const { data: uso } = await db.from('settings').select('value').eq('key', chaveUso).maybeSingle()
            const v = ((uso?.value as any) || { minutos: 0, ligacoes: 0 })
            v.minutos = (v.minutos || 0) + minutos
            v.ligacoes = (v.ligacoes || 0) + 1
            await db.from('settings').upsert(
              { key: chaveUso, value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' },
            )
          }
        } catch { /* medição nunca derruba o webhook */ }
      }
    }

    atual.meta.buyer_id = p.buyer_id || new URL(request.url).searchParams.get('buyer_id') || atual.meta.buyer_id
    atual.meta.lead_id = new URL(request.url).searchParams.get('lead_id') || atual.meta.lead_id

    await db.from('settings').upsert(
      { key: chave, value: atual, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )

    // FASE 2: fala do CLIENTE aciona a sugestão da IA (o corretor responde ao que o
    // cliente disse — fala do próprio atendente não gera sugestão). Só roda pra quem
    // tem o roteiro LIGADO (gate + debounce dentro de avaliarConversa). Falha aqui
    // não afeta a transcrição — o catch de fora já protege.
    if (evento === 'transcription-content' && p.Track === 'outbound_track') {
      try { await avaliarConversa(callSid) } catch (e: any) {
        console.error('[voice/transcription] assist:', e?.message)
      }
    }
  } catch (e: any) {
    console.error('[voice/transcription]', e?.message)
  }
  return NextResponse.json({ ok: true })
}
