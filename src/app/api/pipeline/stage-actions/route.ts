import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { stageActionsAPI } from '@/lib/pipeline-stage-actions-api'

export async function GET(request: Request) {
  const db = createAdminClient()
  return stageActionsAPI(db, () => callerBuyer(db))(request)
}
