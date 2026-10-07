import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readWhatsAppHistory, readConversationMetadata, compareTimestamp } from '@/lib/wa-message-history'

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

  const msgs = await readWhatsAppHistory(after => {
    let q = db.from('client_messages')
      .select('id,client_buyer_id,direction,body,media_type,media_url,wa_message_id,created_at,read_at')
      .order('id').limit(500)
    if (after) q = q.gt('id', after)
    return q
  }).catch(() => null)
  if (!msgs) return NextResponse.json({ error: 'Conversations unavailable' }, { status: 503 })
  msgs.sort(compareTimestamp(m => m.created_at, 'desc'))

  const byBuyer: Record<string, { last: any; unread: number }> = {}
  for (const m of msgs || []) {
    if (!byBuyer[m.client_buyer_id]) byBuyer[m.client_buyer_id] = { last: m, unread: 0 }
    if (m.direction === 'in' && !m.read_at) byBuyer[m.client_buyer_id].unread++
  }

  const ids = Object.keys(byBuyer)
  if (ids.length === 0) return NextResponse.json({ conversations: [], migrated: true })

  const buyers = await readConversationMetadata(ids, (block, after) => {
    let q = db.from('buyers')
      .select('id, name, email, phone, crm_plan')
      .in('id', block).order('id', { ascending: true }).limit(100)
    if (after) q = q.gt('id', after)
    return q
  }).catch(() => null)
  if (!buyers) return NextResponse.json({ error: 'Conversations unavailable' }, { status: 503 })
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
  }).filter(Boolean).sort(compareTimestamp((c: any) => c.last_at, 'desc'))

  return NextResponse.json({ conversations, migrated: true })
}
