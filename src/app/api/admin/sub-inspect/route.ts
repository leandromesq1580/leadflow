import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getCommunityContext } from '@/lib/community-access'

// GET ?q=nome-ou-email — inspeciona (SÓ LEITURA) buyer + assinatura Stripe + última fatura,
// pra ver plano atual, se pagou e o que está pendente. Admin.
export async function GET(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ctx.me.isAdmin) return NextResponse.json({ error: 'Apenas admin.' }, { status: 403 })
    const q = (request.nextUrl.searchParams.get('q') || '').replace(/[,()*]/g, ' ').trim()
    if (!q) return NextResponse.json({ error: 'q obrigatório (nome ou email)' }, { status: 400 })

    const { data: buyers } = await ctx.db
      .from('buyers')
      .select('id, name, email, phone, whatsapp, crm_subscription_id, crm_subscription_status, crm_plan, crm_billing_interval')
      .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10)
    if (!buyers?.length) return NextResponse.json({ matches: [] })

    const stripe = getStripe()
    const out: any[] = []
    for (const b of buyers) {
      const rec: any = {
        id: b.id, name: b.name, email: b.email,
        crm_plan: b.crm_plan, crm_subscription_status: b.crm_subscription_status, crm_billing_interval: b.crm_billing_interval,
      }
      if (b.crm_subscription_id) {
        try {
          const s: any = await stripe.subscriptions.retrieve(b.crm_subscription_id, { expand: ['latest_invoice'] })
          const price = s.items?.data?.[0]?.price
          const inv = s.latest_invoice
          rec.sub = {
            id: s.id,
            status: s.status,
            planMeta: s.metadata?.plan || null,
            unitAmount: price?.unit_amount ?? null,
            interval: price?.recurring?.interval ?? null,
            intervalCount: price?.recurring?.interval_count ?? null,
            ultimaFatura: inv ? { numero: inv.number, status: inv.status, amount_due: inv.amount_due, amount_paid: inv.amount_paid, created: inv.created, hosted_url: inv.hosted_invoice_url } : null,
          }
        } catch (e: any) { rec.subError = e?.message }
      }
      out.push(rec)
    }
    return NextResponse.json({ matches: out })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
