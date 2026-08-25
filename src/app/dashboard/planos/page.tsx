import { PolicyCheck } from '@/components/policy-check'
import { CrmPlansGrid } from './crm-plans-grid'
import { getLocale } from '@/lib/locale'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BillingPortalButton } from '@/components/billing-portal-button'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const locale = await getLocale()
  const title = locale === 'en' ? 'CRM Pro Plans — Lead4Producers' : locale === 'es' ? 'Planes CRM Pro — Lead4Producers' : 'Planos CRM Pro — Lead4Producers'
  return { title }
}

export default async function PlanosPage() {
  const locale = await getLocale()
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: buyer } = await db
    .from('buyers')
    .select('crm_subscription_id, crm_subscription_status')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const hasActiveStripeSubscription = !!buyer?.crm_subscription_id && buyer.crm_subscription_status === 'active'

  if (hasActiveStripeSubscription) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl p-7" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-[22px] mb-4" style={{ background: 'var(--accent-light)' }}>⚡</div>
          <p className="text-[11px] font-extrabold uppercase tracking-wider mb-1" style={{ color: 'var(--accent)' }}>
            {L('Assinatura ativa', 'Active subscription', 'Suscripción activa')}
          </p>
          <h1 className="text-[24px] font-extrabold" style={{ color: 'var(--fg)' }}>CRM Pro</h1>
          <p className="text-[14px] mt-2 max-w-2xl leading-relaxed" style={{ color: 'var(--fg-secondary)' }}>
            {L(
              'Sua assinatura tem renovação automática. No portal seguro da Stripe você pode atualizar o cartão, consultar faturas ou cancelar a próxima renovação sem perder o período que já foi pago.',
              'Your subscription renews automatically. In Stripe’s secure portal you can update your card, view invoices, or cancel the next renewal without losing the period you already paid for.',
              'Tu suscripción se renueva automáticamente. En el portal seguro de Stripe puedes actualizar la tarjeta, ver facturas o cancelar la próxima renovación sin perder el período ya pagado.',
            )}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <BillingPortalButton
              returnPath="/dashboard/planos"
              label={L('Gerenciar ou cancelar assinatura', 'Manage or cancel subscription', 'Gestionar o cancelar suscripción')}
              className="px-5 py-3 rounded-xl text-[13px] font-extrabold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50"
            />
            <Link href="/dashboard/credits" className="px-5 py-3 rounded-xl text-[13px] font-bold text-center" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)', border: '1px solid var(--border)' }}>
              {L('Ver cobrança e histórico', 'View billing and history', 'Ver cobros e historial')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-[26px] font-extrabold" style={{ color: 'var(--fg)' }}>{L('Escolha seu plano CRM Pro', 'Choose your CRM Pro plan', 'Elige tu plan CRM Pro')}</h1>
        <p className="text-[14px] mt-2 max-w-2xl mx-auto" style={{ color: 'var(--fg-secondary)' }}>
          {L(
            'Quanto mais longo o compromisso, menor o valor por mês. Todos incluem o CRM Pro completo. Pagamento à vista, renovação automática — cancele quando quiser.',
            'The longer the commitment, the lower your monthly price. All plans include the full CRM Pro. Paid upfront, auto-renews — cancel anytime.',
            'Mientras más largo el compromiso, menor el precio por mes. Todos incluyen el CRM Pro completo. Pago por adelantado, renovación automática — cancela cuando quieras.'
          )}
        </p>
      </div>
      <PolicyCheck context="checkout_crm" />
      <CrmPlansGrid />
    </div>
  )
}
