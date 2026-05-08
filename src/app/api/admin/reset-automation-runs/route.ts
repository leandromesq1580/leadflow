import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/reset-automation-runs?secret=X&automation_id=Y
 *
 * Deleta automation_runs de uma automacao especifica pra que ela
 * possa re-disparar pros leads atualmente nos targets. Util quando
 * havia bug que registrava runs fantasma sem realmente executar.
 *
 * SAFE: nao deleta whatsapp_messages enviadas — apenas o registro de
 * idempotency. Se a automacao ja enviou de fato, vai re-enviar agora;
 * por isso so usar quando voce TEM CERTEZA que nao foi enviado.
 *
 * Optionally: ?status=NULL pra deletar so runs sem status (fantasmas).
 *             ?dry=1 pra contar sem deletar.
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const secret = url.searchParams.get('secret')
  if (secret !== (process.env.POLL_SECRET || 'leadflow-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const automationId = url.searchParams.get('automation_id')
  if (!automationId) return NextResponse.json({ error: 'Missing automation_id' }, { status: 400 })

  const dry = url.searchParams.get('dry') === '1'
  const onlyNullStatus = url.searchParams.get('status') === 'NULL'

  const db = createAdminClient()

  // Conta antes
  const beforeQuery = db.from('automation_runs').select('id', { count: 'exact', head: true }).eq('automation_id', automationId)
  if (onlyNullStatus) beforeQuery.is('status', null)
  const { count: beforeCount } = await beforeQuery

  if (dry) return NextResponse.json({ would_delete: beforeCount ?? 0, dry: true })

  // Delete direto pelo automation_id (sem select prévio)
  let delQuery = db.from('automation_runs').delete().eq('automation_id', automationId)
  if (onlyNullStatus) delQuery = delQuery.is('status', null)
  const { error, count: deletedCount } = await delQuery

  if (error) return NextResponse.json({ error: error.message, before: beforeCount }, { status: 500 })

  // Conta depois pra confirmar
  const { count: afterCount } = await db.from('automation_runs').select('id', { count: 'exact', head: true }).eq('automation_id', automationId)

  return NextResponse.json({ before: beforeCount ?? 0, after: afterCount ?? 0, deleted: (beforeCount ?? 0) - (afterCount ?? 0), reportedCount: deletedCount })
}
