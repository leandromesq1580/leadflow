import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/** Nome do cookie de sessão (mesmo formato que o login.tsx escreve). */
function authCookieName() {
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace('https://', '').split('.')[0]
  return `sb-${ref}-auth-token`
}

/**
 * POST /api/admin/impersonate/stop — encerra o "Ver como" e restaura a sessão
 * original do admin a partir do cookie `l4p-imp-backup`. Se não houver backup,
 * apenas limpa a sessão (admin faz login de novo).
 */
export async function POST(request: NextRequest) {
  const authName = authCookieName()
  const backup = request.cookies.get('l4p-imp-backup')?.value

  const res = NextResponse.json({ ok: true, restored: !!backup })

  if (backup) {
    res.cookies.set(authName, backup, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 })
  } else {
    res.cookies.set(authName, '', { path: '/', maxAge: 0 })
  }
  res.cookies.set('l4p-imp-backup', '', { path: '/', maxAge: 0 })
  res.cookies.set('l4p-imp-as', '', { path: '/', maxAge: 0 })

  return res
}
