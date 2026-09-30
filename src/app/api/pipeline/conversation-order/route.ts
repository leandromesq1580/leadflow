import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { conversationOrderAPI } from '@/lib/pipeline-conversation-api'

export async function GET(request: Request) {
  try {
    const db = createAdminClient()
    return await conversationOrderAPI(db, () => callerBuyer(db))(request)
  } catch {
    return Response.json({error:'Conversations unavailable'}, {status:503,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}})
  }
}
