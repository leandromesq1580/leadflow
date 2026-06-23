import { NextResponse } from 'next/server'

/**
 * GET /api/cron/stale-leads — DESATIVADO.
 *
 * A notificação diária de "leads parados há 3+ dias" no WhatsApp foi REMOVIDA a pedido
 * do usuário (2026-06-23): não é necessária. O endpoint fica como no-op pra não quebrar
 * crons existentes (Vercel e/ou VPS) que ainda apontem pra cá — assim ele nunca mais
 * dispara a mensagem, independente de quem chamar. Pra reativar: `git revert` deste commit.
 */
export async function GET() {
  return NextResponse.json({ status: 'disabled', sent: 0, note: 'stale-leads notification removed per user request (2026-06-23)' })
}
