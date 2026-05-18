import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/set-buyer-bridge?secret=X
 * Body: {
 *   email: string,
 *   wa_bridge_url: string,
 *   wa_bridge_key: string,
 *   wa_bridge_phone: string,
 *   wa_bridge_status?: string  // default 'connected'
 * }
 *
 * Configura/sobrescreve a bridge WhatsApp de um buyer. Util pra casos
 * em que 2 buyers compartilham o mesmo numero/bridge (excecao manual).
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { email, wa_bridge_url, wa_bridge_key, wa_bridge_phone, wa_bridge_status } = body
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id, name, email').ilike('email', email).maybeSingle()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  const update: Record<string, unknown> = {}
  if (wa_bridge_url !== undefined) update.wa_bridge_url = wa_bridge_url
  if (wa_bridge_key !== undefined) update.wa_bridge_key = wa_bridge_key
  if (wa_bridge_phone !== undefined) update.wa_bridge_phone = String(wa_bridge_phone)
  if (wa_bridge_status !== undefined) update.wa_bridge_status = wa_bridge_status

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await db.from('buyers').update(update).eq('id', buyer.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: after } = await db.from('buyers')
    .select('id, name, email, wa_bridge_url, wa_bridge_phone, wa_bridge_status')
    .eq('id', buyer.id).single()

  return NextResponse.json({ buyer: { id: buyer.id, name: buyer.name }, after })
}
