import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAdminNewLeadAssignmentHandlers } from '@/lib/admin-new-lead-assignment'

function handlers() {
  return createAdminNewLeadAssignmentHandlers({
    actor: async () => {
      const auth = await createServerSupabase()
      const { data: { user }, error } = await auth.auth.getUser()
      if (error || !user) return null
      const { data: buyer, error: buyerError } = await createAdminClient().from('buyers')
        .select('is_admin').eq('auth_user_id', user.id).maybeSingle()
      if (buyerError) throw new Error('authorization_unavailable')
      return { id: user.id, is_admin: buyer?.is_admin === true }
    },
    rpc: (name, args) => createAdminClient().rpc(name, args),
  })
}
export async function GET(request: Request) { return handlers().GET(request) }
export async function POST(request: Request) { return handlers().POST(request) }
