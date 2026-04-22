import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBridgeForBuyer } from '@/lib/wa-bridge'

const VPS_HOST = '31.220.97.186'
const ADMIN_URL = (process.env.WA_ADMIN_URL || `http://${VPS_HOST}:3458`).replace(/\/$/, '')
const ADMIN_KEY = process.env.WA_ADMIN_KEY || ''

/**
 * POST /api/whatsapp/connect
 * Chama o admin endpoint na VPS (HTTP, nao SSH) pra spinar uma bridge nova
 * pro buyer logado. Retorna url/key do bridge pra polling do QR.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id, name, email').eq('auth_user_id', user.id).maybeSingle()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  // Ja tem bridge?
  const existing = await getBridgeForBuyer(db, buyer.id)
  if (existing && existing.url) {
    return NextResponse.json({ bridge_url: existing.url, bridge_key: existing.key, status: existing.status, phone: existing.phone })
  }

  if (!ADMIN_KEY) {
    return NextResponse.json({ error: 'WA_ADMIN_KEY nao configurado. Contate o admin.' }, { status: 500 })
  }

  // Reserva nova porta (>=3460, evita 3458 do admin)
  const { data: withBridges } = await db
    .from('buyers')
    .select('wa_bridge_url')
    .not('wa_bridge_url', 'is', null)
  const usedPorts = new Set<number>([3456, 3457, 3458])
  for (const b of withBridges || []) {
    const m = (b.wa_bridge_url || '').match(/:(\d+)/)
    if (m) usedPorts.add(parseInt(m[1], 10))
  }
  let port = 3460
  while (usedPorts.has(port)) port++

  const safeName = (buyer.email || buyer.id).split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 20).toLowerCase()

  try {
    const res = await fetch(`${ADMIN_URL}/create-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ADMIN_KEY },
      body: JSON.stringify({ buyer_id: buyer.id, port, name: safeName }),
    })
    const data = await res.json()
    if (!res.ok || !data.api_key) {
      console.error('[WA connect] admin err:', data)
      return NextResponse.json({ error: data.error || 'Falha ao criar bridge' }, { status: 500 })
    }

    const bridgeUrl = `http://${VPS_HOST}:${port}`
    await db.from('buyers').update({
      wa_bridge_url: bridgeUrl,
      wa_bridge_key: data.api_key,
      wa_bridge_status: 'pending_qr',
    }).eq('id', buyer.id)

    return NextResponse.json({ bridge_url: bridgeUrl, bridge_key: data.api_key, status: 'pending_qr' })
  } catch (err: any) {
    console.error('[WA connect] error:', err?.message)
    return NextResponse.json({ error: err?.message || 'admin unreachable' }, { status: 500 })
  }
}
