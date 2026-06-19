import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/reconcile-credits  — DRY-RUN (mostra o plano, não grava)
 * GET /api/admin/reconcile-credits?apply=1 — APLICA
 *
 * Acerta os saldos: pra cada comprador, o crédito USADO passa a refletir os leads
 * do SISTEMA (meta_lead_id) que ele REALMENTE recebeu — teto na compra dele.
 * Os que receberam de graça (roteamento) passam a ter o crédito debitado.
 * NUNCA diminui o usado (sem reembolso); o que passou da compra fica como perda.
 * Admin-gated.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const apply = new URL(request.url).searchParams.get('apply') === '1'

  const { data: credits } = await db.from('credits').select('id, buyer_id, total_purchased, total_used').eq('type', 'lead')
  const { data: leads } = await db.from('leads').select('assigned_to').not('meta_lead_id', 'is', null).not('assigned_to', 'is', null).limit(100000)
  const receivedBy = new Map<string, number>()
  for (const l of leads || []) receivedBy.set(l.assigned_to as string, (receivedBy.get(l.assigned_to as string) || 0) + 1)

  const byBuyer = new Map<string, { rows: any[]; purchased: number; used: number }>()
  for (const c of credits || []) {
    const g = byBuyer.get(c.buyer_id) || { rows: [], purchased: 0, used: 0 }
    g.rows.push(c); g.purchased += c.total_purchased || 0; g.used += c.total_used || 0
    byBuyer.set(c.buyer_id, g)
  }

  const plan: any[] = []
  for (const [buyerId, g] of byBuyer) {
    const received = receivedBy.get(buyerId) || 0
    const targetUsed = Math.min(received, g.purchased)
    const delta = targetUsed - g.used
    if (delta <= 0) continue
    const entry: any = { buyerId, recebidos: received, comprou: g.purchased, usado_antes: g.used, usado_depois: targetUsed, deduzir: delta, sobra_antes: g.purchased - g.used, sobra_depois: g.purchased - targetUsed }
    plan.push(entry)
    if (apply) {
      let rem = delta
      for (const r of g.rows) {
        if (rem <= 0) break
        const canAdd = (r.total_purchased || 0) - (r.total_used || 0)
        const add = Math.min(rem, canAdd)
        if (add > 0) { await db.from('credits').update({ total_used: (r.total_used || 0) + add }).eq('id', r.id); rem -= add }
      }
    }
  }

  const ids = plan.map(p => p.buyerId)
  const { data: bs } = ids.length ? await db.from('buyers').select('id, name').in('id', ids) : { data: [] }
  const nm = new Map((bs || []).map((b: any) => [b.id, b.name]))
  const out = plan.map(p => ({ nome: nm.get(p.buyerId), ...p })).sort((a, b) => b.deduzir - a.deduzir)
  return NextResponse.json({ modo: apply ? 'APLICADO' : 'DRY-RUN (nada gravado)', afetados: out.length, total_creditos_deduzidos: out.reduce((s, p) => s + p.deduzir, 0), plano: out })
}
