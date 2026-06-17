import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSendBridge } from '@/lib/wa-bridge'

async function requireAdmin(db: ReturnType<typeof createAdminClient>, authUserId: string) {
  const { data: me } = await db.from('buyers').select('id, is_admin').eq('auth_user_id', authUserId).single()
  return me?.is_admin ? me : null
}

/** GET /api/admin/clients/messages?buyer_id=X — thread com um cliente. */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  if (!(await requireAdmin(db, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const buyerId = new URL(request.url).searchParams.get('buyer_id')
  if (!buyerId) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const { data: messages } = await db
    .from('client_messages')
    .select('id, direction, body, media_type, media_url, created_at, status')
    .eq('client_buyer_id', buyerId)
    .order('created_at', { ascending: true })
    .limit(500)

  return NextResponse.json({ messages: messages || [] })
}

/** PATCH /api/admin/clients/messages — marca a thread como lida. Body: { buyer_id } */
export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  if (!(await requireAdmin(db, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { buyer_id } = await request.json()
  if (!buyer_id) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })
  await db.from('client_messages').update({ read_at: new Date().toISOString() })
    .eq('client_buyer_id', buyer_id).eq('direction', 'in').is('read_at', null)
  return NextResponse.json({ ok: true })
}

/** POST /api/admin/clients/messages — admin responde um cliente. Body: { buyer_id, body } */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  const me = await requireAdmin(db, user.id)
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { buyer_id, body } = await request.json()
  if (!buyer_id || !body?.trim()) return NextResponse.json({ error: 'buyer_id e mensagem obrigatórios' }, { status: 400 })

  const { data: client } = await db.from('buyers').select('id, name, phone, whatsapp').eq('id', buyer_id).single()
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  const dest = (client.whatsapp || client.phone || '').replace(/[\s\-()]/g, '').replace(/^\+/, '')
  if (!dest) return NextResponse.json({ error: 'Cliente sem telefone' }, { status: 400 })

  // Sai pela bridge do ADMIN que está respondendo (fallback global = número oficial)
  const sb = await resolveSendBridge(db, me.id)
  const r = await fetch(`${sb.url}/send`, {
    method: 'POST',
    headers: { apikey: sb.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: dest, message: body }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({} as any))
    return NextResponse.json({ error: err?.error || `Falha ao enviar (${r.status})` }, { status: r.status })
  }
  const { id: waId } = await r.json().catch(() => ({ id: null }))

  const { data: saved } = await db.from('client_messages').insert({
    client_buyer_id: buyer_id,
    direction: 'out',
    from_phone: sb.phone,
    to_phone: dest,
    body,
    wa_message_id: waId,
    status: 'sent',
  }).select().single()

  return NextResponse.json({ message: saved })
}
