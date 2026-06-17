/**
 * Classificação de lead por ESTÁGIO do pipeline — fonte de verdade real que o
 * comprador usa pra marcar progresso/conversão. O campo `contract_closed` quase
 * nunca é marcado; quem fecha move o lead pro estágio "Fechado/Ganho" (ou similar).
 *
 * Os nomes de estágio variam MUITO entre pipelines (Fechado/Ganho, Issued,
 * Approved, Cadastro Emitido, etc.), então classificamos por padrão de nome.
 */

// Ganho: fechado/ganho/issued/approved/emitido/vendido — mas NÃO "Not Approved",
// "Não aprovado", "Cancelado", "Perdido".
const WON_RE = /fechado|ganho|issued|approv|emitid|vendid|\bwon\b/i
const NOTWON_RE = /not\s*approv|n[ãa]o\s*aprov|cancel|perdid/i
// "Novo"/entrada — lead que ainda não foi trabalhado.
const NEW_RE = /novo|new|entregue|^lead\b|pending|lead4pro|indica/i

export function isWonStage(stage?: string | null, contractClosed?: boolean): boolean {
  if (contractClosed === true) return true
  const s = (stage || '').trim()
  return !!s && WON_RE.test(s) && !NOTWON_RE.test(s)
}

export function isNewStage(stage?: string | null): boolean {
  const s = (stage || '').trim()
  return !s || NEW_RE.test(s)
}

/** Contatado = fechou, marcou reunião, ou já saiu do estágio "Novo". */
export function isContacted(
  stage?: string | null,
  opts?: { contractClosed?: boolean; appointmentSet?: boolean }
): boolean {
  if (opts?.contractClosed || opts?.appointmentSet) return true
  if (isWonStage(stage)) return true
  const s = (stage || '').trim()
  return !!s && !isNewStage(s)
}

/**
 * Busca o estágio atual de cada lead (pipeline_leads → pipeline_stages.name),
 * em lotes de 200 pra não estourar o tamanho da URL do PostgREST.
 */
export async function fetchStageByLead(
  db: { from: (t: string) => any },
  leadIds: string[]
): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  for (let i = 0; i < leadIds.length; i += 200) {
    const chunk = leadIds.slice(i, i + 200)
    if (!chunk.length) continue
    const { data } = await db
      .from('pipeline_leads')
      .select('lead_id, pipeline_stages(name)')
      .in('lead_id', chunk)
    for (const pl of data || []) {
      const nm = (pl as any).pipeline_stages?.name
      if (nm && !map[(pl as any).lead_id]) map[(pl as any).lead_id] = nm
    }
  }
  return map
}
