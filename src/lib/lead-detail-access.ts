import type { AtorPipeline } from '@/lib/pipeline-guard'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>
type DetailScope = { ownerId: string; memberId: string | null }

async function activeIdentity(db: Db, memberId: string, authUserId: string): Promise<boolean> {
  if (!authUserId) return false
  const { data, error } = await db.from('team_members').select('id')
    .eq('id', memberId).eq('auth_user_id', authUserId).eq('is_active', true).maybeSingle()
  return !error && data?.id === memberId
}

/** Read-only scope. A delegated identity never grants board/send/mutation access. */
export async function leadDetailScope(db: Db, actor: AtorPipeline, leadId: string): Promise<DetailScope | null> {
  try {
    const { data: lead, error } = await db.from('leads').select('assigned_to,assigned_to_member').eq('id', leadId).maybeSingle()
    if (error || !lead?.assigned_to) return null
    if (actor.memberId && lead.assigned_to_member !== actor.memberId) return null
    if (actor.memberId) {
      if (!await activeIdentity(db, actor.memberId, actor.authUserId)) return null
      return { ownerId: lead.assigned_to, memberId: actor.memberId }
    }
    if (actor.isAdmin || actor.buyerId === lead.assigned_to) return { ownerId: lead.assigned_to, memberId: null }

    // Buyer resolution takes precedence in atorDaSessao. Check the exact assigned
    // member independently: its agency buyer_id need not be the lead's owner.
    if (lead.assigned_to_member) {
      const { data: member, error: memberError } = await db.from('team_members').select('id')
        .eq('id', lead.assigned_to_member).eq('auth_user_id', actor.authUserId).eq('is_active', true).maybeSingle()
      if (memberError) return null
      if (actor.authUserId && member && member.id === lead.assigned_to_member) return { ownerId: lead.assigned_to, memberId: member.id }
    }

    // Same agency rule as podeOperarQuadro, but fail closed on database errors.
    // Keep that shared write guard unchanged; this grant applies only to details.
    const { data: owner, error: ownerError } = await db.from('buyers').select('email, auth_user_id').eq('id', lead.assigned_to).maybeSingle()
    if (ownerError || !owner) return null
    const { data: links, error: linksError } = await db.from('team_members')
      .select('id, email, auth_user_id').eq('buyer_id', actor.buyerId).eq('is_active', true)
    if (linksError) return null
    const agency = (links || []).some(link =>
      (owner.auth_user_id && link.auth_user_id === owner.auth_user_id) ||
      (owner.email && link.email && link.email.toLowerCase().trim() === owner.email.toLowerCase().trim()))
    return agency ? { ownerId: lead.assigned_to, memberId: null } : null
  } catch { return null }
}

/** Authorize before PII, fence reassignment, then revalidate active identity.
 * Separate reads are not a transaction: this bounds the revocation race without
 * a migration and never returns a delegated read after failed revalidation.
 */
export async function readLeadDetail(db: Db, actor: AtorPipeline, leadId: string) {
  try {
    const scope = await leadDetailScope(db, actor, leadId)
    if (!scope) return null
    let query = db.from('leads').select(`
      *,
      buyer:buyers!assigned_to(name, email),
      activities:lead_activity(*, buyer:buyers(name))
    `).eq('id', leadId).eq('assigned_to', scope.ownerId)
    if (scope.memberId) query = query.eq('assigned_to_member', scope.memberId)
    const { data: lead, error } = await query.single()
    if (error || !lead) return null
    if (scope.memberId && !await activeIdentity(db, scope.memberId, actor.authUserId)) return null
    return lead
  } catch { return null }
}
