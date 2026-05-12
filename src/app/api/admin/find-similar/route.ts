import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/find-similar?secret=X&q=Y
 * Busca buyers e team_members onde email/nome/whatsapp contem o termo.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const q = url.searchParams.get('q')
  if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 400 })

  const db = createAdminClient()
  const pat = `%${q}%`

  const { data: buyers } = await db
    .from('buyers')
    .select('id, name, email, whatsapp, phone, crm_plan, is_active, is_agency, created_at')
    .or(`email.ilike.${pat},name.ilike.${pat},whatsapp.ilike.${pat},phone.ilike.${pat}`)
    .limit(50)

  const { data: members } = await db
    .from('team_members')
    .select('id, name, email, buyer_id, is_active, buyer:buyers(name, email)')
    .or(`email.ilike.${pat},name.ilike.${pat}`)
    .limit(50)

  return NextResponse.json({ buyers: buyers || [], team_members: members || [] })
}
