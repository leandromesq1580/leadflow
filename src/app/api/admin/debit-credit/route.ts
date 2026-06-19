import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/admin/debit-credit — debita N créditos de lead de um comprador (ajuste/retroativo).
 * Body: { buyer_id, qty=1, note? }
 * Debita só até o saldo DISPONÍVEL (remaining>0, não expirado). NUNCA deixa negativo —
 * se faltar saldo, reporta o shortfall em vez de inventar saldo. Admin-only.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: me } = await db.from('buyers').select('is_admin').eq('auth_user_id', user.id).single()
  if (!me?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const buyer_id = body.buyer_id
  const qty = Math.max(1, Number(body.qty) || 1)
  const note = (body.note || '').toString().slice(0, 200)
  if (!buyer_id) return NextResponse.json({ error: 'Missing buyer_id' }, { status: 400 })

  const { data: buyer } = await db.from('buyers').select('id, name').eq('id', buyer_id).single()
  if (!buyer) return NextResponse.json({ error: 'Comprador nao encontrado' }, { status: 404 })

  const { data: creds } = await db.from('credits')
    .select('id, total_purchased, total_used, expires_at').eq('buyer_id', buyer_id).eq('type', 'lead')
  const nowMs = Date.now()
  // só linhas vivas com saldo, ordenadas por mais saldo primeiro
  const rows = (creds || [])
    .map((c: any) => ({ ...c, rem: (Number(c.total_purchased) || 0) - (Number(c.total_used) || 0) }))
    .filter((c: any) => c.rem > 0 && (!c.expires_at || new Date(c.expires_at).getTime() > nowMs))
    .sort((a: any, b: any) => b.rem - a.rem)
  const remainingBefore = rows.reduce((s: number, c: any) => s + c.rem, 0)

  let debited = 0
  for (let i = 0; i < qty; i++) {
    const row = rows.find((r: any) => r.rem > 0)
    if (!row) break
    const newUsed = (Number(row.total_used) || 0) + 1
    const { error } = await db.from('credits').update({ total_used: newUsed }).eq('id', row.id)
    if (error) break
    row.total_used = newUsed
    row.rem -= 1
    debited++
  }

  return NextResponse.json({
    comprador: (buyer.name || '').trim(),
    note,
    pedido: qty,
    debitado: debited,
    nao_debitado_sem_saldo: qty - debited,
    saldo_antes: remainingBefore,
    saldo_depois: remainingBefore - debited,
  })
}
