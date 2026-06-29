import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

const MISSING_TABLE = /relation .*community_dm_messages.* does not exist|could not find the table/i

/**
 * GET /api/community/dm — lista de conversas (outro membro, última mensagem, não-lidas) + total não-lido.
 */
export async function GET(_request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ conversations: [], unread: 0 })

    const { data, error } = await db
      .from('community_dm_messages')
      .select('sender_id, recipient_id, body, read, created_at')
      .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) {
      if (MISSING_TABLE.test(error.message)) return NextResponse.json({ conversations: [], unread: 0, needsMigration: true })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const convs = new Map<string, { otherId: string; last: string; lastAt: string; unread: number }>()
    for (const m of data || []) {
      const other = m.sender_id === me.id ? m.recipient_id : m.sender_id
      let c = convs.get(other)
      if (!c) { c = { otherId: other, last: m.body, lastAt: m.created_at, unread: 0 }; convs.set(other, c) }
      if (m.recipient_id === me.id && !m.read) c.unread++
    }

    const ids = [...convs.keys()]
    const names: Record<string, string> = {}
    if (ids.length) {
      const { data: buyers } = await db.from('buyers').select('id, name').in('id', ids)
      for (const b of buyers || []) names[b.id] = b.name || 'Membro'
    }
    const conversations = [...convs.values()]
      .map(c => ({ ...c, name: names[c.otherId] || 'Membro' }))
      .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
    const unread = conversations.reduce((a, c) => a + c.unread, 0)
    return NextResponse.json({ conversations, unread })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
