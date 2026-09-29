import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { sequenceAPI } from '@/lib/sequence-api'

export async function POST(request: Request) {
  const db = createAdminClient()
  return sequenceAPI(db, () => callerBuyer(db))('preview', request)
}
