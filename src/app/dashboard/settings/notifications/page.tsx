import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { NotificationsForm } from './notifications-form'

export const dynamic = 'force-dynamic'

export default async function NotificationsSettingsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id, name, whatsapp, phone, email').eq('auth_user_id', user.id).single()
  if (!buyer) redirect('/login')

  const { data: prefsRow } = await db.from('notification_preferences').select('*').eq('buyer_id', buyer.id).maybeSingle()
  const prefs = prefsRow || {
    buyer_id: buyer.id,
    reminder_intervals: [60, 15, 5],
    push_enabled: true,
    banner_enabled: true,
    sound_enabled: true,
    sound_volume: 70,
    sound_file: 'chime',
    whatsapp_enabled: false,
    whatsapp_intervals: [30],
    email_enabled: false,
    email_intervals: [60],
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: 'var(--fg)' }}>🔔 Gestão de Avisos</h1>
      <p className="text-[14px] mb-8" style={{ color: 'var(--fg-secondary)' }}>
        Configure como e quando receber lembretes de reuniões. Ninguém perde um appointment.
      </p>

      <NotificationsForm buyer={buyer} initialPrefs={prefs as any} />
    </div>
  )
}
