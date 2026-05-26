import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/** Nome do cookie de sessão (mesmo formato que o login.tsx escreve). */
function authCookieName() {
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace('https://', '').split('.')[0]
  return `sb-${ref}-auth-token`
}

/**
 * POST /api/admin/impersonate  — "Ver como" usuário.
 * Admin troca a própria sessão pela de um comprador (sessão real gerada via
 * service role, SEM enviar email). A sessão original do admin fica salva no
 * cookie `l4p-imp-backup` pra ele poder voltar pelo banner do topo.
 * Body: { buyerId }
 */
export async function POST(request: NextRequest) {
  // 1. Quem chama precisa ser admin
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { buyerId } = await request.json().catch(() => ({} as any))
  if (!buyerId) return NextResponse.json({ error: 'buyerId obrigatório' }, { status: 400 })

  const { data: target } = await db
    .from('buyers')
    .select('id, name, email, auth_user_id')
    .eq('id', buyerId)
    .single()
  if (!target?.email) return NextResponse.json({ error: 'Comprador não encontrado ou sem email' }, { status: 404 })
  if (target.auth_user_id && target.auth_user_id === user.id) {
    return NextResponse.json({ error: 'Você já está nesta conta' }, { status: 400 })
  }

  // 2. Gera uma sessão real pro usuário alvo — generateLink NÃO envia email,
  //    e verifyOtp consome o token e devolve access_token + refresh_token.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\\n/g, '').replace(/\s+$/, '')
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/\\n/g, '').replace(/\s+$/, '')
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim().replace(/\\n/g, '').replace(/\s+$/, '')

  const adminAuth = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: link, error: linkErr } = await adminAuth.auth.admin.generateLink({
    type: 'magiclink',
    email: target.email,
  })
  const hashed = link?.properties?.hashed_token
  if (linkErr || !hashed) {
    return NextResponse.json({ error: linkErr?.message || 'Falha ao gerar sessão do usuário' }, { status: 500 })
  }

  const verifier = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: verified, error: vErr } = await verifier.auth.verifyOtp({
    token_hash: hashed,
    type: 'magiclink',
  })
  const session = verified?.session
  if (vErr || !session?.access_token) {
    return NextResponse.json({ error: vErr?.message || 'Falha ao validar sessão do usuário' }, { status: 500 })
  }

  // 3. Monta o cookie no MESMO formato do login (base64 de JSON)
  const cookieValue = Buffer.from(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: 'bearer',
  })).toString('base64')

  const authName = authCookieName()
  const res = NextResponse.json({ ok: true, name: target.name || target.email })

  // Backup da sessão do admin (pra "Voltar para admin"). Só sobrescreve se ainda
  // não houver backup — evita perder o admin original em duplo-clique.
  const existingBackup = request.cookies.get('l4p-imp-backup')?.value
  const adminCookie = request.cookies.get(authName)?.value
  if (!existingBackup && adminCookie) {
    res.cookies.set('l4p-imp-backup', adminCookie, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 4 })
  }
  // Marca quem está sendo visto (pro banner) — lido server-side no layout
  res.cookies.set('l4p-imp-as', encodeURIComponent(target.name || target.email), { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 4 })
  // Troca a sessão ativa pela do usuário alvo. O cookie sai URL-encoded
  // (NextResponse encoda o base64) — o parser client-side decodifica
  // (decodeURIComponent) pra resolver o buyerId no inbox/agenda.
  res.cookies.set(authName, cookieValue, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 })

  return res
}
