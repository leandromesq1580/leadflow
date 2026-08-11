import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Grava o idioma do corretor em settings (`locale:<buyerId>`) — é o que os
 * avisos automáticos do servidor (push, WhatsApp) usam pra falar a língua
 * certa. Chamado pelo LocaleSync (1 POST por mudança de idioma, por aparelho).
 */
export async function POST(req: Request) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({} as { locale?: string }))
  const locale = body?.locale === 'en' || body?.locale === 'es' || body?.locale === 'pt' ? body.locale : null
  if (!locale) return NextResponse.json({ error: 'locale inválido' }, { status: 400 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id').eq('auth_user_id', user.id).single()
  if (!buyer) return NextResponse.json({ error: 'buyer não encontrado' }, { status: 404 })

  const { error } = await db.from('settings').upsert(
    { key: `locale:${buyer.id}`, value: { locale }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, locale })
}
