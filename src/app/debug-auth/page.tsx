import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function DebugAuthPage() {
  const cookieStore = await cookies()
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').split('.')[0]
  const baseName = `sb-${ref}-auth-token`

  const all = cookieStore.getAll()
  const sbCookies = all.filter(c => c.name.startsWith('sb-'))
  const single = cookieStore.get(baseName)

  // Tenta parse do cookie unico
  let parseResult: Record<string, unknown> = {}
  if (single?.value) {
    try {
      const asJson = JSON.parse(single.value)
      parseResult.asJson = 'ok'
      parseResult.hasAccessToken = !!asJson.access_token
    } catch (e) {
      parseResult.asJson = `throw: ${(e as Error).message}`
    }
    try {
      const decoded = JSON.parse(Buffer.from(single.value, 'base64').toString())
      parseResult.asBase64 = 'ok'
      parseResult.base64HasToken = !!decoded.access_token
    } catch (e) {
      parseResult.asBase64 = `throw: ${(e as Error).message?.slice(0, 60)}`
    }
  }

  // Tenta getUser
  const supabase = await createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()

  return (
    <pre style={{ padding: 20, fontFamily: 'monospace', fontSize: 12 }}>
{JSON.stringify({
  ref,
  baseName,
  sbCookieNames: sbCookies.map(c => `${c.name} (${c.value.length}b)`),
  singleExists: !!single,
  singleLength: single?.value?.length,
  singlePreview: single?.value?.slice(0, 80),
  parseResult,
  userId: user?.id || null,
  userEmail: user?.email || null,
  authError: error?.message || null,
}, null, 2)}
    </pre>
  )
}
