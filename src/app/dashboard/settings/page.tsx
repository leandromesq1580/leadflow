import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { SettingsForm } from './settings-form'
import { BillingPortalButton } from '@/components/billing-portal-button'
import { getStripe } from '@/lib/stripe'
import { getLocale } from '@/lib/locale'

export const dynamic = 'force-dynamic'

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]

export default async function SettingsPage() {
  const locale = await getLocale()
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  const dateLocale = locale === 'en' ? 'en-US' : locale === 'es' ? 'es-US' : 'pt-BR'
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

  const hasStripeSubscription = !!buyer.crm_subscription_id && buyer.crm_subscription_status === 'active'
  let cancelAtPeriodEnd = false
  let subscriptionEndsOn: string | null = null
  if (hasStripeSubscription) {
    try {
      const subscription: any = await getStripe().subscriptions.retrieve(buyer.crm_subscription_id)
      cancelAtPeriodEnd = !!subscription.cancel_at_period_end
      const periodEnd = subscription.current_period_end || subscription.items?.data?.[0]?.current_period_end
      if (periodEnd) subscriptionEndsOn = new Date(periodEnd * 1000).toLocaleDateString(dateLocale)
    } catch (error) {
      console.error('[Settings] Não foi possível consultar a assinatura:', error)
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: 'var(--fg)' }}>{L('Configurações', 'Settings', 'Configuración')}</h1>
      <p className="text-[14px] mb-8" style={{ color: 'var(--fg-secondary)' }}>{L('Gerencie seu perfil, licenças e disponibilidade', 'Manage your profile, licenses, and availability', 'Gestiona tu perfil, licencias y disponibilidad')}</p>

      {hasStripeSubscription && (
        <section className="rounded-2xl p-5 mb-8" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-[11px] font-extrabold uppercase tracking-wider mb-1" style={{ color: 'var(--accent)' }}>
                {L('Assinatura CRM Pro', 'CRM Pro subscription', 'Suscripción CRM Pro')}
              </p>
              <h2 className="text-[17px] font-extrabold" style={{ color: 'var(--fg)' }}>
                {cancelAtPeriodEnd
                  ? L('Renovação automática cancelada', 'Automatic renewal canceled', 'Renovación automática cancelada')
                  : L('Renovação automática ativada', 'Automatic renewal enabled', 'Renovación automática activada')}
              </h2>
              <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
                {cancelAtPeriodEnd
                  ? L(
                      `Não haverá nova cobrança${subscriptionEndsOn ? `; seu acesso continua até ${subscriptionEndsOn}` : ''}.`,
                      `There will be no new charge${subscriptionEndsOn ? `; your access continues until ${subscriptionEndsOn}` : ''}.`,
                      `No habrá otro cobro${subscriptionEndsOn ? `; tu acceso continúa hasta ${subscriptionEndsOn}` : ''}.`,
                    )
                  : L(
                      'Use o portal seguro da Stripe para atualizar o cartão, consultar faturas ou cancelar a próxima renovação. Ao cancelar, o acesso já pago continua até o fim do ciclo.',
                      'Use Stripe’s secure portal to update your card, view invoices, or cancel the next renewal. After canceling, paid access continues through the end of the billing cycle.',
                      'Usa el portal seguro de Stripe para actualizar la tarjeta, ver facturas o cancelar la próxima renovación. El acceso pagado continúa hasta el final del ciclo.',
                    )}
              </p>
            </div>
            <BillingPortalButton
              returnPath="/dashboard/settings"
              label={cancelAtPeriodEnd
                ? L('Abrir portal da assinatura', 'Open subscription portal', 'Abrir portal de suscripción')
                : L('Gerenciar ou cancelar', 'Manage or cancel', 'Gestionar o cancelar')}
              className="shrink-0 px-4 py-2.5 rounded-xl text-[12px] font-extrabold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50"
            />
          </div>
        </section>
      )}

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
