type Locale = 'pt' | 'en' | 'es'
export function teamRemovalError(code: string, locale: string) {
  const messages: Record<string, Record<Locale, string>> = {
    UNAUTHORIZED: { pt: 'Sua sessão não foi reconhecida. Entre novamente e tente remover.', en: 'Your session was not recognized. Sign in again and try removing the member.', es: 'No se reconoció tu sesión. Inicia sesión de nuevo e intenta eliminar al miembro.' },
    FORBIDDEN: { pt: 'Você não tem permissão para remover este agente.', en: 'You do not have permission to remove this agent.', es: 'No tienes permiso para eliminar a este agente.' },
    NO_PIPELINE: { pt: 'Configure um funil para receber os leads antes de remover este agente. Nada foi removido.', en: 'Set up a pipeline to receive the leads before removing this agent. Nothing was removed.', es: 'Configura un embudo para recibir los leads antes de eliminar a este agente. No se eliminó nada.' },
    CONFLICT: { pt: 'Há um vínculo de lead com outra conta. A remoção foi cancelada para preservar os dados.', en: 'A lead is linked to another account. Removal was cancelled to preserve the data.', es: 'Hay un lead vinculado a otra cuenta. Se canceló la eliminación para conservar los datos.' },
    REMOVE_FAILED: { pt: 'Não foi possível remover o agente. Nenhum lead foi apagado. Tente novamente.', en: 'Unable to remove the agent. No leads were deleted. Please try again.', es: 'No se pudo eliminar al agente. No se eliminó ningún lead. Inténtalo de nuevo.' },
  }
  return (messages[code] || messages.REMOVE_FAILED)[locale === 'en' || locale === 'es' ? locale : 'pt']
}

/** A non-2xx response (or an HTML login redirect) must never look like success. */
export async function removeTeamMember(id: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`/api/team/members/${encodeURIComponent(id)}`, { method: 'DELETE' })
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.success !== true) {
    throw new Error(data?.code || (response.status === 401 ? 'UNAUTHORIZED' : 'REMOVE_FAILED'))
  }
  return data as { success: true; returned_leads: number; archived_leads: number }
}
