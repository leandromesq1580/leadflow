import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { createEmailDependencies } from '@/lib/manual-email-server'
import { handleManualEmailHttp } from '@/lib/manual-email-http'

export const runtime = 'nodejs'
export const maxDuration = 180

export async function POST(request: Request) {
  return handleManualEmailHttp(request, () => {
    const db = createAdminClient()
    // No buyer_id parameter, admin override, team mirror or pipeline ownership fallback.
    return createEmailDependencies(db, () => callerBuyer(db))
  })
}
