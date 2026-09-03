/** UI hint only. The transaction rechecks ownership and team membership. */
export function canReclaimTeamLead(
  caller: { id: string; isAdmin: boolean },
  lead: { assigned_to?: string | null; assigned_to_member?: string | null },
  member: { id: string; buyer_id: string },
  memberBuyerId: string | null,
): boolean {
  if (member.buyer_id !== caller.id) return false
  if (lead.assigned_to_member && lead.assigned_to_member !== member.id) return false
  if (lead.assigned_to === caller.id) return lead.assigned_to_member === member.id
  return caller.isAdmin && !!memberBuyerId && memberBuyerId !== caller.id && lead.assigned_to === memberBuyerId
}

export function reclaimError(code: string | undefined, locale: string): string {
  const messages: Record<string, [string, string, string]> = {
    FORBIDDEN: ['Você não tem permissão para recuperar este lead.', 'You do not have permission to reclaim this lead.', 'No tienes permiso para recuperar este prospecto.'],
    NO_PIPELINE: ['Crie seu funil antes de recuperar o lead.', 'Create your pipeline before reclaiming the lead.', 'Crea tu embudo antes de recuperar el prospecto.'],
    CONFLICT: ['O responsável mudou. Atualize a página e tente novamente.', 'The assignee changed. Refresh and try again.', 'El responsable cambió. Actualiza la página e inténtalo de nuevo.'],
    ARCHIVED: ['Restaure o lead arquivado antes de recuperá-lo.', 'Restore the archived lead before reclaiming it.', 'Restaura el prospecto archivado antes de recuperarlo.'],
    UNAUTHORIZED: ['Entre novamente na sua conta.', 'Please sign in again.', 'Inicia sesión de nuevo.'],
    DEFAULT: ['Não foi possível concluir. Atualize e tente novamente.', 'Could not complete the request. Refresh and try again.', 'No se pudo completar. Actualiza e inténtalo de nuevo.'],
  }
  return (messages[code || ''] || messages.DEFAULT)[locale === 'en' ? 1 : locale === 'es' ? 2 : 0]
}
