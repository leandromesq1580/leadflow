import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/clients/conversations — lista os CLIENTES (compradores) com
 * conversa, com preview da última mensagem + não-lidas. Só admin.
 */
export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: msgs, error } = await db
    .from('client_messages')
    .select('client_buyer_id, direction, body, media_type, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(3000)
  if (error) {
    // migration 019 ainda não aplicada
    if (/client_messages/i.test(error.message || '')) return NextResponse.json({ conversations: [], migrated: false })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const byBuyer: Record<string, { last: any; unread: number }> = {}
  for (const m of msgs || []) {
    if (!byBuyer[m.client_buyer_id]) byBuyer[m.client_buyer_id] = { last: m, unread: 0 }
    if (m.direction === 'in' && !m.read_at) byBuyer[m.client_buyer_id].unread++
  }

  const ids = Object.keys(byBuyer)
  if (ids.length === 0) return NextResponse.json({ conversations: [], migrated: true })

  const { data: buyers } = await db
    .from('buyers')
    .select('id, name, email, phone, crm_plan')
    .in('id', ids)
  const bmap: Record<string, any> = {}
  for (const b of buyers || []) bmap[b.id] = b

  const conversations = ids.map(id => {
    const b = bmap[id]
    if (!b) return null
    const last = byBuyer[id].last
    let preview = last.body || ''
    if (!preview && last.media_type) preview = '📎 Mídia'
    return {
      buyer_id: id,
      name: b.name || 'Cliente',
      email: b.email || '',
      phone: b.phone || '',
      crm_plan: b.crm_plan || 'free',
      last_body: preview || '(sem texto)',
      last_direction: last.direction,
      last_at: last.created_at,
      unread: byBuyer[id].unread,
    }
  }).filter(Boolean).sort((a: any, b: any) => b.last_at.localeCompare(a.last_at))

  return NextResponse.json({ conversations, migrated: true })
}
