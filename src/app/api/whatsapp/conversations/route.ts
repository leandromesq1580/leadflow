import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface Conversation {
  lead_id: string
  lead_name: string
  lead_phone: string
  lead_state: string | null
  lead_ai_score: number | null
  last_body: string | null
  last_direction: 'in' | 'out'
  last_sent_at: string
  unread: number
}

/**
 * GET /api/whatsapp/conversations?buyer_id=X
 * Retorna 1 linha por lead (conversa), com preview da última mensagem + contagem de não-lidas.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const buyerId = url.searchParams.get('buyer_id')
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()

  // Pega TODAS as mensagens do buyer (limit alto, ordena do mais recente pro mais antigo)
  const { data: messages, error } = await db
    .from('whatsapp_messages')
    .select('id, lead_id, direction, body, media_type, sent_at, read_at')
    .eq('buyer_id', buyerId)
    .not('lead_id', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(2000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrupa por lead_id: pega a primeira msg (mais recente) + conta unread
  const byLead: Record<string, { last: any; unread: number }> = {}
  for (const m of messages || []) {
    if (!m.lead_id) continue
    if (!byLead[m.lead_id]) byLead[m.lead_id] = { last: m, unread: 0 }
    if (m.direction === 'in' && !m.read_at) byLead[m.lead_id].unread++
  }

  const leadIds = Object.keys(byLead)
  if (leadIds.length === 0) return NextResponse.json({ conversations: [] })

  // Busca dados dos leads pra exibir nome/telefone/estado/AI score
  const { data: leads } = await db
    .from('leads')
    .select('id, name, phone, state, ai_score')
    .in('id', leadIds)

  const leadMap: Record<string, any> = {}
  for (const L of leads || []) leadMap[L.id] = L

  const conversations: Conversation[] = leadIds
    .map(id => {
      const L = leadMap[id]
      if (!L) return null
      const last = byLead[id].last
      let preview = last.body || ''
      if (!preview && last.media_type) {
        preview = last.media_type === 'image' ? '📷 Imagem'
               : last.media_type === 'audio' ? '🎤 Áudio'
               : last.media_type === 'video' ? '🎥 Vídeo'
               : '📎 Arquivo'
      }
      return {
        lead_id: id,
        lead_name: L.name || 'Sem nome',
        lead_phone: L.phone || '',
        lead_state: L.state || null,
        lead_ai_score: L.ai_score ?? null,
        last_body: preview || '(sem texto)',
        last_direction: last.direction as 'in' | 'out',
        last_sent_at: last.sent_at,
        unread: byLead[id].unread,
      }
    })
    .filter((c): c is Conversation => c !== null)
    .sort((a, b) => b.last_sent_at.localeCompare(a.last_sent_at))

  return NextResponse.json({ conversations })
}
