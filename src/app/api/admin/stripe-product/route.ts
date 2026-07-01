import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getCommunityContext } from '@/lib/community-access'

// Diagnóstico/conserto de produtos do Stripe (admin). GET lista/consulta; POST reativa/arquiva.
// Motivo: produto arquivado no painel do Stripe barra troca de plano ("product is inactive").

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.me.isAdmin) return NextResponse.json({ error: 'Apenas admin.' }, { status: 403 })
    const stripe = getStripe()
    const id = request.nextUrl.searchParams.get('id')
    if (id) {
      const p = await stripe.products.retrieve(id)
      return NextResponse.json({ product: { id: p.id, name: p.name, active: p.active } })
    }
    const [active, inactive] = await Promise.all([
      stripe.products.list({ active: true, limit: 100 }),
      stripe.products.list({ active: false, limit: 100 }),
    ])
    const map = (arr: any[]) => arr.map((p: any) => ({ id: p.id, name: p.name, active: p.active }))
    return NextResponse.json({ ativos: map(active.data), inativos: map(inactive.data) })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.me.isAdmin) return NextResponse.json({ error: 'Apenas admin.' }, { status: 403 })
    const body = await request.json().catch(() => ({}))
    const productId = String(body?.productId || '').trim()
    if (!productId.startsWith('prod_')) return NextResponse.json({ error: 'productId inválido.' }, { status: 400 })
    const active = body?.active !== false // default: reativar
    const stripe = getStripe()
    const p = await stripe.products.update(productId, { active })
    return NextResponse.json({ ok: true, product: { id: p.id, name: p.name, active: p.active } })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
