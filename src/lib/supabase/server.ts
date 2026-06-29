import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose'

// JWKS (chaves publicas ES256) do projeto Supabase — o jose busca uma vez e cacheia.
const SUPABASE_ISSUER = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_ISSUER}/.well-known/jwks.json`))

export async function createServerSupabase() {
  const cookieStore = await cookies()
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0]
  const baseName = `sb-${ref}-auth-token`

  // Tenta cookie unico primeiro (formato que o login.tsx escreve manualmente).
  // Se nao, tenta cookies chunked (.0, .1, ...) que o supabase-js auto-persiste.
  const authCookie = cookieStore.get(baseName)
  let rawValue: string | null = authCookie?.value || null
  if (!rawValue) {
    const chunks: string[] = []
    for (let i = 0; i < 10; i++) {
      const c = cookieStore.get(`${baseName}.${i}`)
      if (!c?.value) break
      chunks.push(c.value)
    }
    if (chunks.length > 0) rawValue = chunks.join('')
  }

  let accessToken: string | null = null
  if (rawValue) {
    // Tenta base64 -> JSON (formato padrao do login.tsx)
    try {
      const decoded = JSON.parse(Buffer.from(rawValue, 'base64').toString())
      accessToken = decoded.access_token
    } catch {
      // Tenta JSON direto (caso seja valor nao-encoded)
      try {
        const parsed = JSON.parse(rawValue)
        accessToken = parsed.access_token
      } catch {}
    }
    // Se nao conseguiu e tem prefixo 'base64-' (novo formato supabase-js)
    if (!accessToken && rawValue.startsWith('base64-')) {
      try {
        const decoded = JSON.parse(Buffer.from(rawValue.slice(7), 'base64').toString())
        accessToken = decoded.access_token
      } catch {}
    }
  }

  // Create a standard Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      },
    }
  )

  // getUser valida a ASSINATURA do JWT (ES256) contra o JWKS publico do Supabase.
  // Token forjado / assinatura invalida -> REJEITADO (fecha o bypass critico de
  // auth/pagante/admin em TODA rota). Token GENUINO porem EXPIRADO -> ACEITO: o app
  // grava o access_token no cookie no login e nao o renova server-side, entao exigir
  // validade deslogaria sessoes legitimas a cada ~1h. A assinatura valida ja prova a
  // autenticidade; endurecer expiracao depende de implementar refresh server-side (TODO).
  supabase.auth.getUser = (async (jwt?: string) => {
    const token = jwt || accessToken
    if (!token) {
      return { data: { user: null }, error: { message: 'No auth cookie' } } as any
    }
    try {
      let payload: any
      try {
        ;({ payload } = await jwtVerify(token, JWKS, { issuer: SUPABASE_ISSUER }))
      } catch (e: any) {
        // Assinatura ja validada acima; so estourou por expiracao -> aceita o payload.
        // Qualquer outro erro (assinatura invalida/forjada, issuer errado) -> rejeita.
        if (e?.code === 'ERR_JWT_EXPIRED') payload = decodeJwt(token)
        else throw e
      }
      return { data: { user: { id: payload.sub, email: payload.email, role: payload.role } }, error: null } as any
    } catch {
      return { data: { user: null }, error: { message: 'Invalid token' } } as any
    }
  }) as typeof supabase.auth.getUser

  return supabase
}
