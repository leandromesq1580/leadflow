import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/agents — lista agentes (buyers) ativos pro admin.
 * Server-side com service role, então ignora o RLS de buyers (que só deixa
 * cada usuário ler o próprio registro). Protegido por checagem de is_admin.
 */
export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await db
    .from('buyers')
    .select('id, name, email')
    .eq('is_active', true)
    .order('name')

  return NextResponse.json({ agents: data || [] })
}
