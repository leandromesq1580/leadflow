import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInitials } from '@/lib/utils'
import { redirect } from 'next/navigation'
import { BuyersList } from './buyers-list'
import { readBuyerPolicy } from '@/lib/buyer-policy'

export const dynamic = 'force-dynamic'

export default async function BuyersPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { staffIds } = await readBuyerPolicy(db)
  const { data: teamPrices, error: teamPriceError } = await db.from('sales_team_pricing')
    .select('buyer_id, is_member, lead_unit_price_cents').eq('is_member', true)
  if (teamPriceError) throw new Error('Não foi possível consultar a equipe de vendas.')
  const teamPricing = new Map((teamPrices || []).map(p => [p.buyer_id, p.lead_unit_price_cents]))

  const { data: buyers } = await db
    .from('buyers')
    .select('*')
    .order('created_at', { ascending: false })

  // Pagante REAL = pagou dinheiro de verdade: tem pagamento concluído (compra de
  // créditos) OU assinatura Stripe ativa. Cortesia (Pro setado na mão, sem pagamento)
  // NÃO conta como pagante. Uma query só, em vez de N.
  const { data: paidRows } = await db.from('payments').select('buyer_id').eq('status', 'completed')
  const paidIds = new Set((paidRows || []).map(p => p.buyer_id))
  const SUB_OK = ['active', 'past_due', 'trialing']
  const now = Date.now()

  const buyerData = await Promise.all((buyers || []).map(async (b) => {
    const { data: states } = await db.from('buyer_states').select('state_code').eq('buyer_id', b.id)
    const { data: credits } = await db.from('credits').select('type, total_purchased, total_used').eq('buyer_id', b.id)
    const { count: leadCount } = await db.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', b.id).not('meta_lead_id', 'is', null)

    const leadCreds = credits?.filter(c => c.type === 'lead') || []
    const apptCreds = credits?.filter(c => c.type === 'appointment') || []

    const hasSub = !!b.crm_subscription_id && SUB_OK.includes(b.crm_subscription_status)
    const paying = paidIds.has(b.id) || hasSub
    const trialing = b.crm_subscription_status === 'trialing'
      || b.crm_plan !== 'free'                                   // plano elevado sem pagar = cortesia/trial
      || (b.trial_ends_at && new Date(b.trial_ends_at).getTime() > now)
    const tier: 'paying' | 'trial' | 'free' = paying ? 'paying' : (trialing ? 'trial' : 'free')

    return {
      id: b.id,
      name: b.name,
      email: b.email,
      phone: b.phone,
      created_at: b.created_at,
      is_active: b.is_active,
      is_admin: b.is_admin,
      is_staff: staffIds.has(b.id),
      is_sales_team: teamPricing.has(b.id),
      team_lead_price: teamPricing.has(b.id) ? teamPricing.get(b.id)! / 100 : null,
      crm_plan: b.crm_plan || 'free',
      is_agency: b.is_agency || false,
      tier,
      subStatus: b.crm_subscription_status || null,
      crmPaying: !!b.crm_subscription_id && b.crm_subscription_status === 'active',
      initials: getInitials(b.name),
      avatarHue: (b.name.charCodeAt(0) * 37) % 360,
      states: states?.map(s => s.state_code) || [],
      leadCredits: leadCreds.reduce((s, c) => s + c.total_purchased - c.total_used, 0),
      apptCredits: apptCreds.reduce((s, c) => s + c.total_purchased - c.total_used, 0),
      leadsReceived: leadCount || 0,
    }
  }))

  return <BuyersList buyers={buyerData} />
}
