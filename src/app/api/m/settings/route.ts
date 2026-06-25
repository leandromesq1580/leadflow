import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/m/settings — pro app mobile. Buyer pela SESSÃO (sem buyer_id na query,
 * evitando a brecha do GET /api/settings) + estados e disponibilidade ativos.
 */
export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers')
    .select('id, name, phone, whatsapp, cal_link, notification_email, notification_sms')
    .eq('auth_user_id', user.id).single()
  if (!buyer) return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })

  let activeStates: string[] = []
  let activeAvailability: string[] = []
  try { const { data } = await db.from('buyer_states').select('state_code').eq('buyer_id', buyer.id); activeStates = (data || []).map((s: any) => s.state_code) } catch {}
  try { const { data } = await db.from('buyer_availability').select('day_type, period').eq('buyer_id', buyer.id); activeAvailability = (data || []).map((a: any) => `${a.day_type}_${a.period}`) } catch {}

  return NextResponse.json({ buyer, activeStates, activeAvailability })
}
