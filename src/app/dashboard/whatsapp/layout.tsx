import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { CrmGate } from '@/components/crm-gate'
import { hasCrmAccess, fetchBuyerForGate } from '@/lib/crm-access'

export const dynamic = 'force-dynamic'

export default async function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const buyer = await fetchBuyerForGate(createAdminClient(), user.id)
  return <CrmGate hasAccess={hasCrmAccess(buyer)}>{children}</CrmGate>
}
