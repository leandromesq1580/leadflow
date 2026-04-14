import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
  const cookieStore = await cookies()

  // Get the Supabase auth token from cookies
  // @supabase/ssr stores it as sb-{ref}-auth-token
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0]
  const authCookie = cookieStore.get(`sb-${ref}-auth-token`)

  let accessToken: string | null = null

  if (authCookie?.value) {
    try {
      // Cookie value is base64-encoded JSON with access_token and refresh_token
      const decoded = JSON.parse(Buffer.from(authCookie.value, 'base64').toString())
      accessToken = decoded.access_token
    } catch {
      // Try parsing as plain JSON
      try {
        const parsed = JSON.parse(authCookie.value)
        accessToken = parsed.access_token
      } catch {
        // Not valid JSON, ignore
      }
    }
  }

  // Create a Supabase client with the user's access token
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      },
    }
  )

  // Override getUser to work with our manual token extraction
  return {
    ...supabase,
    auth: {
      ...supabase.auth,
      getUser: async () => {
        if (!accessToken) {
          return { data: { user: null }, error: { message: 'No auth cookie' } as any }
        }

        // Decode the JWT to get user info without an API call
        try {
          const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString())
          return {
            data: {
              user: {
                id: payload.sub,
                email: payload.email,
                role: payload.role,
              }
            },
            error: null,
          } as any
        } catch {
          return { data: { user: null }, error: { message: 'Invalid token' } as any }
        }
      },
    },
  }
}
