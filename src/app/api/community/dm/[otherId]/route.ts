import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

const MISSING_TABLE = /relation .*community_dm_messages.* does not exist|could not find the table/i

/**
 * GET /api/community/dm/[otherId] — mensagens da conversa entre mim e o outro membro
 * (mais antigas primeiro) + marca como lidas as que ele me mandou. Devolve { messages, name }.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ otherId: string }> }) {
  try {
    const { otherId } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await db
      .from('community_dm_messages')
      .select('id, sender_id, body, created_at')
      .or(`and(sender_id.eq.${me.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${me.id})`)
      .order('created_at', { ascending: true })
      .limit(300)
    if (error) {
      if (MISSING_TABLE.test(error.message)) return NextResponse.json({ messages: [], name: 'Membro' })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // marca como lidas as recebidas
    try {
      await db.from('community_dm_messages').update({ read: true })
        .eq('sender_id', otherId).eq('recipient_id', me.id).eq('read', false)
    } catch {}

    const { data: buyer } = await db.from('buyers').select('name').eq('id', otherId).single()
    const messages = (data || []).map(m => ({ id: m.id, mine: m.sender_id === me.id, body: m.body, created_at: m.created_at }))
    return NextResponse.json({ messages, name: buyer?.name || 'Membro' })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

/**
 * POST /api/community/dm/[otherId] — envia uma mensagem direta. Body: { body }.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ otherId: string }> }) {
  try {
    const { otherId } = await params
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me, allowed } = ctx
    if (!allowed) return NextResponse.json({ error: 'Apenas membros pagantes.' }, { status: 403 })
    if (otherId === me.id) return NextResponse.json({ error: 'Não dá pra mandar mensagem pra você mesmo.' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const text = typeof body?.body === 'string' ? body.body.trim().slice(0, 2000) : ''
    if (!text) return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 })

    const { data: row, error } = await db
      .from('community_dm_messages')
      .insert({ sender_id: me.id, recipient_id: otherId, body: text })
      .select('id, created_at')
      .single()
    if (error) {
      if (MISSING_TABLE.test(error.message)) return NextResponse.json({ error: 'O DM ainda não foi criado. Rode supabase/migrations/025_community_dm.sql.' }, { status: 503 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ message: { id: row.id, mine: true, body: text, created_at: row.created_at } })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
