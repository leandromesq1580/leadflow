import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/cron/stale-leads — Daily WhatsApp digest of stale leads (3+ days)
 * Called by VPS cron at 10am local time
 */
export async function GET(request: NextRequest) {
  const secret = new URL(request.url).searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const threshold = new Date(Date.now() - 3 * 86400000).toISOString()

  // Get all stale pipeline_leads (moved_at >= 3d ago, not closed)
  const { data: staleEntries } = await db
    .from('pipeline_leads')
    .select('id, moved_at, pipeline:pipelines(buyer_id), lead:leads(id, name, phone, contract_closed)')
    .lt('moved_at', threshold)

  if (!staleEntries?.length) return NextResponse.json({ status: 'ok', sent: 0, message: 'No stale leads' })

  // Group by buyer
  const byBuyer: Record<string, any[]> = {}
  for (const entry of staleEntries as any[]) {
    if (entry.lead?.contract_closed) continue
    const buyerId = entry.pipeline?.buyer_id
    if (!buyerId) continue
    if (!byBuyer[buyerId]) byBuyer[buyerId] = []
    byBuyer[buyerId].push(entry)
  }

  // Send WhatsApp digest to each buyer
  const bridgeUrl = (process.env.WA_BRIDGE_URL || 'http://31.220.97.186:3457').replace(/\/$/, '')
  const bridgeKey = (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()
  let sent = 0

  for (const [buyerId, entries] of Object.entries(byBuyer)) {
    const { data: buyer } = await db.from('buyers').select('name, phone, whatsapp').eq('id', buyerId).single()
    const targetPhone = buyer?.whatsapp || buyer?.phone
    if (!targetPhone) continue

    const top = entries.slice(0, 5)
    const more = entries.length - top.length

    const lines = top.map(e => {
      const days = Math.floor((Date.now() - new Date(e.moved_at).getTime()) / 86400000)
      return `• *${e.lead.name}* — ${days}d parado`
    }).join('\n')

    const message = `⚠️ *Lead4Producers — Leads precisam de atencao*\n\nVoce tem *${entries.length} lead${entries.length > 1 ? 's' : ''} parado${entries.length > 1 ? 's' : ''}* ha 3+ dias no seu pipeline:\n\n${lines}${more > 0 ? `\n\n_+${more} outros_` : ''}\n\n🔗 lead4producers.com/dashboard/pipeline`

    const cleanPhone = targetPhone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '')
    try {
      await fetch(`${bridgeUrl}/send`, {
        method: 'POST',
        headers: { apikey: bridgeKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: cleanPhone, message }),
      })
      sent++
    } catch (err) {
      console.error(`[Stale] Failed for ${buyerId}:`, err)
    }
  }

  return NextResponse.json({ status: 'ok', total_buyers: Object.keys(byBuyer).length, sent })
}
