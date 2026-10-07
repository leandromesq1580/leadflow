import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer, canActAs } from '@/lib/api-auth'
import { readWhatsAppHistory } from '@/lib/wa-message-history'

/** Only actual, unread customer replies. Historical empty events stay in storage. */
export async function GET(request: NextRequest) {
  const buyerId = new URL(request.url).searchParams.get('buyer_id')
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canActAs(caller, buyerId)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  try {
    const data = await readWhatsAppHistory(after => {
      let q = db.from('whatsapp_messages')
        .select('id,lead_id,direction,body,media_type,media_url,wa_message_id')
        .eq('buyer_id', buyerId).eq('direction', 'in').is('read_at', null)
        .not('lead_id', 'is', null).order('id').limit(500)
      if (after) q = q.gt('id', after)
      return q
    })
    const counts: Record<string, number> = {}
    for (const row of data) if (row.lead_id) counts[row.lead_id] = (counts[row.lead_id] || 0) + 1
    const total = Object.values(counts).reduce((s, n) => s + n, 0)
    return NextResponse.json({ counts, total }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unread messages unavailable' }, { status: 503 })
  }
}
