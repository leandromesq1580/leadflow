import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
  const cookieStore = await cookies()
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0]
  const authCookie = cookieStore.get(`sb-${ref}-auth-token`)

  let accessToken: string | null = null

  if (authCookie?.value) {
    try {
      const decoded = JSON.parse(Buffer.from(authCookie.value, 'base64').toString())
      accessToken = decoded.access_token
    } catch {
      try {
        const parsed = JSON.parse(authCookie.value)
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
