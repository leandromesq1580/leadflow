import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/admin/buyer-debt — Saldo devedor dos compradores PAGOS.
 * Pra cada comprador que pagou (payment concluído ou assinatura ativa):
 * comprou (créditos de lead), recebeu (usados), falta (saldo devedor = leads
 * que pagou e ainda não recebeu). Admin-gated.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Quem pagou de verdade: payment concluído OU assinatura ativa
  const { data: pays } = await db.from('payments').select('buyer_id').eq('status', 'completed')
  const paid = new Set<string>((pays || []).map((p: any) => p.buyer_id))
  const { data: subs } = await db.from('buyers').select('id, crm_subscription_id, crm_subscription_status')
  const SUB_OK = ['active', 'past_due', 'trialing']
  for (const b of subs || []) if (b.crm_subscription_id && SUB_OK.includes(b.crm_subscription_status)) paid.add(b.id)

  // Créditos de lead por comprador
  const { data: credits } = await db.from('credits').select('buyer_id, total_purchased, total_used').eq('type', 'lead')
  const agg = new Map<string, { comprou: number; recebeu: number }>()
  for (const c of credits || []) {
    const g = agg.get(c.buyer_id) || { comprou: 0, recebeu: 0 }
    g.comprou += c.total_purchased || 0; g.recebeu += c.total_used || 0
    agg.set(c.buyer_id, g)
  }

  const { data: bs } = await db.from('buyers').select('id, name, email')
  const nm = new Map<string, any>((bs || []).map((b: any) => [b.id, b]))

  const compradores: any[] = []
  for (const [bid, g] of agg) {
    if (!paid.has(bid)) continue
    const falta = Math.max(0, g.comprou - g.recebeu)
    const b = nm.get(bid)
    compradores.push({ id: bid, nome: (b?.name || '?').trim(), email: b?.email, comprou: g.comprou, recebeu: g.recebeu, falta })
  }
  compradores.sort((a, b) => b.falta - a.falta)
  const total_devido = compradores.reduce((s, c) => s + c.falta, 0)
  const n_devendo = compradores.filter(c => c.falta > 0).length
  return NextResponse.json({ total_devido, n_devendo, n_pagantes: compradores.length, compradores })
}
