import { podeOperarQuadro, type AtorPipeline } from '@/lib/pipeline-guard'
import type { createAdminClient } from '@/lib/supabase/admin'

/** Resolve the authorized owner before loading PII; caller must filter the final read by it. */
export async function leadDetailOwner(db: ReturnType<typeof createAdminClient>, actor: AtorPipeline, leadId: string): Promise<string | null> {
  const { data: lead, error } = await db.from('leads').select('assigned_to,assigned_to_member').eq('id', leadId).maybeSingle()
  if (error || !lead?.assigned_to) return null
  if (actor.memberId && lead.assigned_to_member !== actor.memberId) return null
  if (actor.isAdmin || actor.buyerId === lead.assigned_to || await podeOperarQuadro(db, actor, lead.assigned_to)) return lead.assigned_to
  return null
}
