import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NodeSSH } from 'node-ssh'
import { getBridgeForBuyer } from '@/lib/wa-bridge'

const VPS_HOST = '31.220.97.186'
const VPS_USER = process.env.VPS_SSH_USER || 'root'
const VPS_KEY = process.env.VPS_SSH_KEY || ''  // SSH private key (PEM)

/**
 * POST /api/whatsapp/connect
 * Cria uma nova bridge WhatsApp pro buyer logado (se ainda nao tem).
 * Retorna url/key do bridge pra polling do QR.
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

  if (!VPS_KEY) {
    return NextResponse.json({ error: 'VPS SSH nao configurado (VPS_SSH_KEY). Contate o admin.' }, { status: 500 })
  }

  // Reserva nova porta (3460 + seq existente)
  const { data: withBridges } = await db
    .from('buyers')
    .select('wa_bridge_url')
    .not('wa_bridge_url', 'is', null)
  const usedPorts = new Set<number>()
  for (const b of withBridges || []) {
    const m = (b.wa_bridge_url || '').match(/:(\d+)/)
    if (m) usedPorts.add(parseInt(m[1], 10))
  }
  let port = 3460
  while (usedPorts.has(port)) port++

  const safeName = (buyer.email || buyer.id).split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 20).toLowerCase()

  const ssh = new NodeSSH()
  try {
    await ssh.connect({ host: VPS_HOST, username: VPS_USER, privateKey: VPS_KEY })
    const res = await ssh.execCommand(
      `/usr/local/bin/setup-bridge.sh ${buyer.id} ${port} ${safeName}`,
    )
    if (res.code !== 0) {
      console.error('[WA connect] setup-bridge failed:', res.stderr, res.stdout)
      return NextResponse.json({ error: 'Falha ao criar bridge: ' + (res.stderr || res.stdout).slice(0, 300) }, { status: 500 })
    }

    // Parse API key from output
    const keyMatch = res.stdout.match(/API Key:\s*(\S+)/)
    const apiKey = keyMatch?.[1]
    if (!apiKey) {
      return NextResponse.json({ error: 'Setup OK mas API key nao parseada' }, { status: 500 })
    }

    const bridgeUrl = `http://${VPS_HOST}:${port}`
    await db.from('buyers').update({
      wa_bridge_url: bridgeUrl,
      wa_bridge_key: apiKey,
      wa_bridge_status: 'pending_qr',
    }).eq('id', buyer.id)

    return NextResponse.json({ bridge_url: bridgeUrl, bridge_key: apiKey, status: 'pending_qr' })
  } catch (err: any) {
    console.error('[WA connect] error:', err?.message)
    return NextResponse.json({ error: err?.message || 'SSH failed' }, { status: 500 })
  } finally {
    ssh.dispose()
  }
}
