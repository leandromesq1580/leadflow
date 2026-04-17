import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributeLeadToNextBuyer } from '@/lib/distribute'

/**
 * POST /api/admin/redistribute
 * Re-tenta distribuição de leads com status='new' e assigned_to=null.
 * Protegido por ?secret=
 *
 * Body opcional: { lead_ids: [] } para redistribuir leads específicos.
 * Sem body: redistribui TODOS os pendentes (últimos 7 dias).
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const specificIds: string[] | undefined = body.lead_ids

  const db = createAdminClient()

  let query = db
    .from('leads')
    .select('*')
    .eq('status', 'new')
    .is('assigned_to', null)

  if (specificIds && specificIds.length > 0) {
    query = query.in('id', specificIds)
  } else {
    // Default: last 7 days
    const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString()
    query = query.gte('created_at', cutoff)
  }

  const { data: pending, error } = await query.order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: Array<{ lead_id: string; name: string; buyer?: string; status: 'distributed' | 'no_buyer' }> = []

  for (const lead of pending || []) {
    try {
      const buyer = await distributeLeadToNextBuyer(lead as any)
      results.push({
        lead_id: lead.id,
        name: lead.name,
        buyer: buyer?.name,
        status: buyer ? 'distributed' : 'no_buyer',
      })
    } catch (err: any) {
      results.push({
        lead_id: lead.id,
        name: lead.name,
        status: 'no_buyer',
        buyer: `ERR: ${err?.message?.slice(0, 80)}`,
      })
    }
  }

  const distributed = results.filter(r => r.status === 'distributed').length
  const pending_still = results.filter(r => r.status === 'no_buyer').length

  return NextResponse.json({
    total: results.length,
    distributed,
    no_buyer: pending_still,
    results,
  })
}
