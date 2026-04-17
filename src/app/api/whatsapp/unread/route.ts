import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/whatsapp/unread?buyer_id=X
 * Retorna contagem de mensagens não lidas por lead_id.
 * Response: { counts: { [lead_id]: number }, total: number }
 */
export async function GET(request: NextRequest) {
  const buyerId = new URL(request.url).searchParams.get('buyer_id')
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const db = createAdminClient()
  const { data, error } = await db
    .from('whatsapp_messages')
    .select('lead_id')
    .eq('buyer_id', buyerId)
    .eq('direction', 'in')
    .is('read_at', null)
    .not('lead_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, number> = {}
  for (const row of data || []) {
    const id = row.lead_id as string
    counts[id] = (counts[id] || 0) + 1
  }

  const total = Object.values(counts).reduce((s, n) => s + n, 0)

  return NextResponse.json({ counts, total })
}
