import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInitials } from '@/lib/utils'
import { redirect } from 'next/navigation'
import { BuyersList } from './buyers-list'

export const dynamic = 'force-dynamic'

export default async function BuyersPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const { data: buyers } = await db
    .from('buyers')
    .select('*')
    .order('created_at', { ascending: false })

  const buyerData = await Promise.all((buyers || []).map(async (b) => {
    const { data: states } = await db.from('buyer_states').select('state_code').eq('buyer_id', b.id)
    const { data: credits } = await db.from('credits').select('type, total_purchased, total_used').eq('buyer_id', b.id)
    const { count: leadCount } = await db.from('leads').select('*', { count: 'exact', head: true }).eq('assigned_to', b.id)

    const leadCreds = credits?.filter(c => c.type === 'lead') || []
    const apptCreds = credits?.filter(c => c.type === 'appointment') || []

    return {
      id: b.id,
      name: b.name,
      email: b.email,
      phone: b.phone,
      created_at: b.created_at,
      is_active: b.is_active,
      is_admin: b.is_admin,
      crm_plan: b.crm_plan || 'free',
      is_agency: b.is_agency || false,
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
