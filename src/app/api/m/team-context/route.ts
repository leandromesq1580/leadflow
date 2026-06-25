import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/m/team-context — pro app mobile.
 * Retorna se o comprador é agência + os membros ativos do time (pra delegar lead).
 * Espelha exatamente o que dashboard/leads/page.tsx busca pro AssignButton.
 */
export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id, is_agency').eq('auth_user_id', user.id).single()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  let members: { id: string; name: string }[] = []
  if (buyer.is_agency) {
    try {
      const { data } = await db.from('team_members').select('id, name').eq('buyer_id', buyer.id).eq('is_active', true).order('name')
      members = data || []
    } catch {}
  }

  // buyer_id é o do PRÓPRIO usuário (resolvido pela sessão) — seguro expor ao cliente.
  // Desbloqueia pipeline/whatsapp/tags/follow-ups/settings, que pedem buyer_id no fetch.
  return NextResponse.json({ buyer_id: buyer.id, is_agency: !!buyer.is_agency, members })
}
