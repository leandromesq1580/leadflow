import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { validTeamPrice } from '@/lib/sales-team-pricing'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Entre novamente na sua conta.' }, { status: 401 })
  if (!caller.isAdmin) return NextResponse.json({ error: 'Apenas administradores podem alterar a equipe de vendas.' }, { status: 403 })
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    || typeof body?.is_member !== 'boolean' || !validTeamPrice(body?.lead_unit_price_cents)) {
    return NextResponse.json({ error: 'Informe a marcação e um preço entre US$0,50 e US$1.000,00.' }, { status: 400 })
  }
  const { data: buyer, error: buyerError } = await db.from('buyers').select('id').eq('id', id).maybeSingle()
  if (buyerError) return NextResponse.json({ error: 'Não foi possível consultar o comprador.' }, { status: 500 })
  if (!buyer) return NextResponse.json({ error: 'Comprador não encontrado.' }, { status: 404 })
  const { data, error } = await db.from('sales_team_pricing').upsert({
    buyer_id: id, is_member: body.is_member, lead_unit_price_cents: body.lead_unit_price_cents,
    updated_by: caller.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'buyer_id' }).select('is_member, lead_unit_price_cents').single()
  if (error) return NextResponse.json({ error: 'Não foi possível salvar. Tente novamente.' }, { status: 500 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
}
