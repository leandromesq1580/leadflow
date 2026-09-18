import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readPricingCatalogOrDefault } from '@/lib/lead-pricing'

export const dynamic = 'force-dynamic'

/**
 * GET /api/pricing — catálogo PÚBLICO de pacotes (o que o admin definiu em /admin/precos).
 * Usado pela landing estática (public/nova), calculadora e qualquer tela sem sessão.
 * Não expõe quem alterou. Cache curto na borda (30 s + 30 s stale): mudança aparece em ≤ 1 min.
 */
export async function GET() {
  const c = await readPricingCatalogOrDefault(createAdminClient())
  return NextResponse.json(
    { lead: c.lead, cold_lead: c.cold_lead, anchorLeadCents: c.anchorLeadCents, updatedAt: c.updatedAt },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30' } },
  )
}
