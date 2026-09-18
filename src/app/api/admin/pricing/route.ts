import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import {
  readPricingCatalogForAdmin, readPricingHistory, savePricingCatalog, validateCatalogInput, defaultCatalogInput,
  MIN_UNIT_CENTS, MAX_UNIT_CENTS, MAX_QUANTITY, MAX_PACKAGES,
} from '@/lib/lead-pricing'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

async function requireAdmin(db: ReturnType<typeof createAdminClient>) {
  const caller = await callerBuyer(db)
  if (!caller) return { error: NextResponse.json({ error: 'Entre novamente na sua conta.' }, { status: 401 }) }
  if (!caller.isAdmin) return { error: NextResponse.json({ error: 'Apenas administradores podem alterar preços.' }, { status: 403 }) }
  return { caller }
}

/** GET /api/admin/pricing — catálogo vigente + histórico + limites (pra tela /admin/precos). */
export async function GET() {
  const db = createAdminClient()
  const auth = await requireAdmin(db)
  if ('error' in auth) return auth.error
  try {
    const [{ catalog, storedError }, history] = await Promise.all([readPricingCatalogForAdmin(db), readPricingHistory(db)])
    return NextResponse.json({
      catalog,
      storedError,
      factoryDefault: defaultCatalogInput(),
      history,
      limits: { minUnitCents: MIN_UNIT_CENTS, maxUnitCents: MAX_UNIT_CENTS, maxQuantity: MAX_QUANTITY, maxPackages: MAX_PACKAGES },
    }, { headers: NO_STORE })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao ler preços.' }, { status: 500, headers: NO_STORE })
  }
}

/** PUT /api/admin/pricing — salva o catálogo. Body: { lead: {packages:[{quantity, unitPriceCents}]}, cold_lead: {...} } */
export async function PUT(request: NextRequest) {
  const db = createAdminClient()
  const auth = await requireAdmin(db)
  if ('error' in auth) return auth.error
  const body = await request.json().catch(() => null)
  const v = validateCatalogInput(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400, headers: NO_STORE })
  try {
    const { data: me } = await db.from('buyers').select('email').eq('id', auth.caller.id).maybeSingle()
    const catalog = await savePricingCatalog(db, v.value, { id: auth.caller.id, email: me?.email ?? null })
    const history = await readPricingHistory(db)
    return NextResponse.json({ catalog, history }, { headers: NO_STORE })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao salvar preços.' }, { status: 500, headers: NO_STORE })
  }
}
