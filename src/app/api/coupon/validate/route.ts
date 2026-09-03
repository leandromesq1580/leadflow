import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCoupon } from '@/lib/coupons'
import { PRODUCTS } from '@/lib/stripe'
import { readSalesTeamPricing, purchaseUnitPrice } from '@/lib/sales-team-pricing'

// Valida um cupom da plataforma pro comprador LOGADO e devolve os preços ajustados
// dos pacotes de lead (pra UI mostrar antes do checkout). A validação que vale de
// verdade acontece de novo no /api/checkout — aqui é só exibição.
export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json()

    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ valid: false, error: 'Unauthorized' }, { status: 401 })

    const db = createAdminClient()
    const { data: buyer } = await db
      .from('buyers')
      .select('id, email')
      .eq('auth_user_id', user.id)
      .single()

    const coupon = resolveCoupon(code, buyer?.email)
    if (!coupon) {
      return NextResponse.json({ valid: false, error: 'Cupom inválido para esta conta.' }, { status: 404 })
    }

    const teamPricing = await readSalesTeamPricing(db, buyer!.id)
    const quote = purchaseUnitPrice('lead', PRODUCTS.lead.packages[0].unitPriceCents, teamPricing, coupon)
    const unitPrice = quote.unitPriceCents / 100
    const packages = PRODUCTS.lead.packages.map((p) => ({
      id: p.id,
      quantity: p.quantity,
      total: (p.quantity * quote.unitPriceCents) / 100,
    }))

    return NextResponse.json({ valid: true, code: coupon.code, label: coupon.label, unitPrice, packages, priceSource: quote.source })
  } catch {
    return NextResponse.json({ valid: false, error: 'Erro ao validar cupom.' }, { status: 500 })
  }
}
