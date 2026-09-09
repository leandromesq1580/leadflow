import { createAdminClient } from '@/lib/supabase/admin'
import { handleEmailUnsubscribe } from '@/lib/manual-email-unsubscribe'

export const runtime = 'nodejs'

function handle(request: Request) {
  return handleEmailUnsubscribe(request, async token => {
    const db = createAdminClient()
    const { data, error } = await db.from('manual_email_preferences')
      .update({ suppressed_at: new Date().toISOString() }).eq('token', token).select('token')
    if (error) throw new Error('Suppression failed')
    return data?.length === 1
  })
}

export const GET = handle
export const POST = handle
