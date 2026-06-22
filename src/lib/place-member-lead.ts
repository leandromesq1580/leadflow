/**
 * Coloca o lead no pipeline do MEMBRO do time (quando delegado).
 *
 * CORRIGE O BUG: antes, o `/api/team/assign` DELETAVA o card do pipeline do dono e
 * só recriava no do membro SE o membro tivesse `auth_user_id` — se não tivesse (ou
 * ainda não vinculado), o lead ficava sem card nenhum ("no limbo"). E o auto-distribute
 * nem tentava criar. Aqui: só deleta o card antigo QUANDO consegue criar o novo no
 * pipeline do membro; se o membro não tem pipeline próprio, mantém o card como está.
 *
 * Auto-vincula o membro a um buyer pelo email se preciso.
 * Retorna o buyer_id do membro (pra migrar a thread de WhatsApp) ou null se não colocou.
 */
export async function placeLeadInMemberPipeline(db: any, leadId: string, member: any): Promise<string | null> {
  if (!member) return null

  // Auto-link: membro sem auth_user_id mas com email que bate num buyer → vincula agora
  if (!member.auth_user_id && member.email) {
    const { data: matchBuyer } = await db.from('buyers').select('auth_user_id').eq('email', member.email).single()
    if (matchBuyer?.auth_user_id) {
      await db.from('team_members').update({ auth_user_id: matchBuyer.auth_user_id }).eq('id', member.id)
      member.auth_user_id = matchBuyer.auth_user_id
    }
  }
  if (!member.auth_user_id) return null // membro sem login → sem pipeline próprio; mantém o card atual

  const { data: memberBuyer } = await db.from('buyers').select('id').eq('auth_user_id', member.auth_user_id).single()
  if (!memberBuyer) return null

  const { data: pipe } = await db
    .from('pipelines')
    .select('id, stages:pipeline_stages(id, position)')
    .eq('buyer_id', memberBuyer.id)
    .eq('is_default', true)
    .single()
  if (!pipe?.stages?.length) return null

  const firstStage = (pipe.stages as any[]).sort((a: any, b: any) => a.position - b.position)[0]

  // move: remove de qualquer pipeline e coloca no do membro (1º estágio). Só agora,
  // depois de garantir que o destino existe — assim o lead nunca fica sem card.
  await db.from('pipeline_leads').delete().eq('lead_id', leadId)
  await db.from('pipeline_leads').upsert({
    lead_id: leadId, pipeline_id: pipe.id, stage_id: firstStage.id,
    position: 0, moved_at: new Date().toISOString(),
  }, { onConflict: 'lead_id,pipeline_id' })

  return memberBuyer.id
}
