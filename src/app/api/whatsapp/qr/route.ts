import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBridgeForBuyer } from '@/lib/wa-bridge'

/**
 * GET /api/whatsapp/qr
 * Proxy pro /qr e /status do bridge do buyer logado.
 * Front-end faz polling desse endpoint pra mostrar o QR code.
 * Quando status virar 'connected', atualiza o DB.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  const bridge = await getBridgeForBuyer(db, buyer.id)
  if (!bridge) return NextResponse.json({ status: 'not_configured' })

  // Get status from bridge
  try {
    const statusRes = await fetch(`${bridge.url}/status`, { headers: { apikey: bridge.key } })
    const status = await statusRes.json()

    let qr: string | null = null
    if (status.hasQR) {
      const qrRes = await fetch(`${bridge.url}/qr`, { headers: { apikey: bridge.key } })
      if (qrRes.ok) qr = (await qrRes.json()).qr
    }

    // Sync DB status
    const newStatus = status.ready ? 'connected' : (status.hasQR ? 'pending_qr' : 'starting')
    const updates: Record<string, unknown> = { wa_bridge_status: newStatus }
    if (status.ready && status.number) updates.wa_bridge_phone = String(status.number)
    await db.from('buyers').update(updates).eq('id', buyer.id)

    return NextResponse.json({
      status: newStatus,
      ready: !!status.ready,
      number: status.number || null,
      qr,
    })
  } catch (err: any) {
    return NextResponse.json({ status: 'unreachable', error: err?.message }, { status: 200 })
  }
}

/** POST /api/whatsapp/qr — logout (desconecta bridge) */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  const bridge = await getBridgeForBuyer(db, buyer.id)
  if (!bridge) return NextResponse.json({ status: 'not_configured' })

  try {
    await fetch(`${bridge.url}/logout`, { method: 'POST', headers: { apikey: bridge.key } })
    await db.from('buyers').update({ wa_bridge_status: 'disconnected', wa_bridge_phone: null }).eq('id', buyer.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}
