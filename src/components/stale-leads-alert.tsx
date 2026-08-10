import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

interface Props { buyerId: string }

export async function StaleLeadsAlert({ buyerId }: Props) {
  const db = createAdminClient()
  const threshold = new Date(Date.now() - 3 * 86400000).toISOString()

  // Get buyer's pipelines
  const { data: pipelines } = await db.from('pipelines').select('id').eq('buyer_id', buyerId)
  if (!pipelines?.length) return null

  const pipelineIds = pipelines.map(p => p.id)

  const { data: staleEntries } = await db
    .from('pipeline_leads')
    .select('lead_id, moved_at, lead:leads(contract_closed, archived, assigned_to)')
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
  // De quebra, tira o que nunca deveria estar ali: lead arquivado e lead que já foi
  // reatribuído a outro corretor (a linha do funil sobrevive à reatribuição).
  const leadsParados = new Set(
    (staleEntries || [])
      .filter((e: any) => {
        const l = e.lead
        if (!l || l.contract_closed || l.archived) return false
        return !l.assigned_to || l.assigned_to === buyerId
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
            {staleCount} lead{staleCount > 1 ? 's' : ''} precisa{staleCount > 1 ? 'm' : ''} de atencao
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: '#c2410c' }}>
            Parado{staleCount > 1 ? 's' : ''} ha 3+ dias no pipeline. Hora de fazer follow-up!
          </p>
        </div>
        <span className="text-[12px] font-bold px-3 py-2 rounded-lg flex-shrink-0" style={{ background: '#ea580c', color: '#fff' }}>
          Ver Pipeline →
        </span>
      </div>
    </Link>
  )
}
