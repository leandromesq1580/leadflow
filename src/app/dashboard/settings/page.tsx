import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { SettingsForm } from './settings-form'

export const dynamic = 'force-dynamic'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]

export default async function SettingsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('*').eq('auth_user_id', user.id).single()
  if (!buyer) redirect('/login')

  // Get buyer's states
  const { data: states } = await db.from('buyer_states').select('state_code').eq('buyer_id', buyer.id)
  const activeStates = states?.map(s => s.state_code) || []

  // Get buyer's availability. `hours` (migration 030) é a granularidade opcional de 1h;
  // se a coluna ainda não existe, cai no select antigo = período inteiro.
  let availability: Array<{ day_type: string; period: string; hours?: number[] | null }> = []
  const withHours = await db.from('buyer_availability').select('day_type, period, hours').eq('buyer_id', buyer.id)
  if (withHours.error) {
    const fb = await db.from('buyer_availability').select('day_type, period').eq('buyer_id', buyer.id)
    availability = (fb.data as any) || []
  } else {
    availability = (withHours.data as any) || []
  }
  const activeAvailability = availability.map(a => `${a.day_type}_${a.period}`)
  // { 'weekday_morning': [8,10] } — só pros que têm hora escolhida.
  const activeAvailabilityHours: Record<string, number[]> = {}
  for (const a of availability) {
    if (Array.isArray(a.hours) && a.hours.length) activeAvailabilityHours[`${a.day_type}_${a.period}`] = a.hours.map(Number)
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: 'var(--fg)' }}>Configuracoes</h1>
      <p className="text-[14px] mb-8" style={{ color: 'var(--fg-secondary)' }}>Gerencie seu perfil, licencas e disponibilidade</p>

      <SettingsForm
        buyer={buyer}
        activeStates={activeStates}
        activeAvailability={activeAvailability}
        activeAvailabilityHours={activeAvailabilityHours}
        allStates={US_STATES}
      />
    </div>
  )
}
