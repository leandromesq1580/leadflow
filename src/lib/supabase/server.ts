import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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

  // Monkey-patch auth.getUser to decode JWT locally
  const originalGetUser = supabase.auth.getUser.bind(supabase.auth)
  supabase.auth.getUser = async () => {
    if (!accessToken) {
      return { data: { user: null }, error: { message: 'No auth cookie' } } as any
    }
    try {
      const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString())
      return {
        data: {
          user: { id: payload.sub, email: payload.email, role: payload.role }
        },
        error: null,
      } as any
    } catch {
      return { data: { user: null }, error: { message: 'Invalid token' } } as any
    }
  }

  return supabase
}
