import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
  const cookieStore = await cookies()
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0]
  const baseName = `sb-${ref}-auth-token`

  // Supabase-js armazena JWT grande chunked em cookies .0, .1, .2...
  // Concatena se existirem; senao usa o cookie unico.
  let rawValue: string | null = null
  const single = cookieStore.get(baseName)
  if (single?.value) {
    rawValue = single.value
  } else {
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
    // Supabase prefixa com 'base64-' quando e o valor codificado
    const normalized = rawValue.startsWith('base64-') ? rawValue.slice(7) : rawValue
    try {
      const decoded = JSON.parse(Buffer.from(normalized, 'base64').toString())
      accessToken = decoded.access_token
    } catch {
      try {
        const parsed = JSON.parse(rawValue)
        accessToken = parsed.access_token
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
