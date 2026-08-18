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
function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export async function GET() {
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
    const statusRes = await fetch(`${bridge.url}/status`, {
      headers: { apikey: bridge.key },
      signal: AbortSignal.timeout(10000),
    })
    if (!statusRes.ok) throw new Error(`Bridge status HTTP ${statusRes.status}`)
    const status = await statusRes.json()

    let qr: string | null = null
    if (status.hasQR) {
      const qrRes = await fetch(`${bridge.url}/qr`, {
        headers: { apikey: bridge.key },
        signal: AbortSignal.timeout(10000),
      })
      if (!qrRes.ok) throw new Error(`Bridge QR HTTP ${qrRes.status}`)
      qr = (await qrRes.json()).qr || null
      if (!qr) throw new Error('Bridge informou QR, mas não devolveu a imagem')
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
  } catch (error: unknown) {
    return NextResponse.json({ status: 'unreachable', error: errorMessage(error, 'Bridge indisponível') }, { status: 200 })
  }
}

/** POST /api/whatsapp/qr — desconecta ou força a geração de um QR novo */
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
    const body = await request.json().catch(() => ({})) as { action?: string }
    const restarting = body.action === 'restart'
    const bridgeRes = await fetch(`${bridge.url}/${restarting ? 'restart' : 'logout'}`, {
      method: 'POST',
      headers: { apikey: bridge.key },
      signal: AbortSignal.timeout(15000),
    })
    if (!bridgeRes.ok) throw new Error(`Bridge ${restarting ? 'restart' : 'logout'} HTTP ${bridgeRes.status}`)
    await db.from('buyers').update({
      wa_bridge_status: restarting ? 'starting' : 'disconnected',
      wa_bridge_phone: null,
    }).eq('id', buyer.id)
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error, 'Falha ao reiniciar o bridge') }, { status: 500 })
  }
}
