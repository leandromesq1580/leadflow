import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { getLocale } from '@/lib/locale'

interface Props { buyerId: string }

export async function StaleLeadsAlert({ buyerId }: Props) {
  const locale = await getLocale()
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  const db = createAdminClient()
  const threshold = new Date(Date.now() - 3 * 86400000).toISOString()

  // Get buyer's pipelines
  const { data: pipelines } = await db.from('pipelines').select('id').eq('buyer_id', buyerId)
  if (!pipelines?.length) return null

  const pipelineIds = pipelines.map(p => p.id)

  const { data: staleEntries } = await db
    .from('pipeline_leads')
    .select('lead_id, moved_at, lead:leads(contract_closed, archived, assigned_to, assigned_to_member)')
    .in('pipeline_id', pipelineIds)
    .lt('moved_at', threshold)

  // CONTA LEAD, NÃO LINHA DE FUNIL (bug relatado em 07/08/2026).
  //
  // O CRM deixa o mesmo lead estar em vários funis ao mesmo tempo, e cada funil é uma
  // linha em pipeline_leads. Contando linha, uma cliente com 15 leads via o aviso
  // "32 leads precisam de atenção" — havia lead dela aparecendo em 4 funis
  // ("Vendas" + "nao atendeu" + "NAO ATENDEU" + "nao tem interesse"), contado 4x.
  // Aviso que exagera vira aviso ignorado.
  //
  // De quebra, tira lead arquivado — ele saía do Kanban mas continuava gritando aqui.
  //
  // CUIDADO com o dono: em conta de agência o lead fica com assigned_to do DONO e é
  // delegado ao corretor por assigned_to_member — o funil é do corretor e o trabalho
  // é dele. Filtrar só por assigned_to escondia 533 leads reais da Fernanda (membro
  // do time da Regiane). Então só descarta lead de OUTRO dono quando não há delegação
  // nenhuma: aí é sobra de reatribuição, e a linha do funil ficou órfã.
  const leadsParados = new Set(
    (staleEntries || [])
      .filter((e: any) => {
        const l = e.lead
        if (!l || l.contract_closed || l.archived) return false
        if (!l.assigned_to || l.assigned_to === buyerId) return true
        return !!l.assigned_to_member   // delegado: é trabalho deste corretor
      })
      .map((e: any) => e.lead_id)
      .filter(Boolean)
  )
  const staleCount = leadsParados.size
  if (staleCount === 0) return null

  return (
    <Link href="/dashboard/pipeline" className="block rounded-2xl mb-6 p-5 transition-all hover:shadow-md"
      style={{ background: 'linear-gradient(135deg, #fff7ed, #fef2f2)', border: '1px solid #fed7aa' }}>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#fff', border: '1px solid #fed7aa' }}>
          <span className="text-[24px]">⚠️</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-extrabold" style={{ color: '#9a3412' }}>
            {staleCount === 1
              ? L('1 lead precisa de atenção', '1 lead needs attention', '1 lead necesita atención')
              : L(`${staleCount} leads precisam de atenção`, `${staleCount} leads need attention`, `${staleCount} leads necesitan atención`)}
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: '#c2410c' }}>
            {staleCount === 1
              ? L('Parado há 3+ dias no pipeline. Hora de fazer follow-up!', 'Sitting in the pipeline for 3+ days. Time to follow up!', 'Parado 3+ días en el pipeline. ¡Hora de dar seguimiento!')
              : L('Parados há 3+ dias no pipeline. Hora de fazer follow-up!', 'Sitting in the pipeline for 3+ days. Time to follow up!', 'Parados 3+ días en el pipeline. ¡Hora de dar seguimiento!')}
          </p>
        </div>
        <span className="text-[12px] font-bold px-3 py-2 rounded-lg flex-shrink-0" style={{ background: '#ea580c', color: '#fff' }}>
          {L('Ver Pipeline', 'View Pipeline', 'Ver Pipeline')} →
        </span>
      </div>
    </Link>
  )
}
