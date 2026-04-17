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

  // Count stale leads (3+ days, not closed)
  const { data: staleEntries } = await db
    .from('pipeline_leads')
    .select('id, moved_at, lead:leads(contract_closed)')
    .in('pipeline_id', pipelineIds)
    .lt('moved_at', threshold)

  const staleCount = (staleEntries || []).filter((e: any) => !e.lead?.contract_closed).length
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
