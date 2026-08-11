import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRODUCTS, getStripe } from '@/lib/stripe'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BuyButton } from './buy-button'
import { CouponBox } from './coupon-box'
import { PolicyCheck } from '@/components/policy-check'
import { CrmPlansGrid } from '@/app/dashboard/planos/crm-plans-grid'
import { CrmChangePlan } from './crm-change-plan'
import { getCrmPlan, CRM_PLAN_LIST } from '@/lib/crm-plans'
import { BillingPortalButton } from '@/components/billing-portal-button'
import { getLocale } from '@/lib/locale'

export const dynamic = 'force-dynamic'

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; cancelled?: string }>
}) {
  const params = await searchParams
  const locale = await getLocale()
  const L = (pt: string, en: string, es: string) => locale === 'en' ? en : locale === 'es' ? es : pt
  const dateLocale = locale === 'en' ? 'en-US' : locale === 'es' ? 'es-US' : 'pt-BR'
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: buyer } = await db.from('buyers').select('id, crm_plan, crm_subscription_status, crm_subscription_id').eq('auth_user_id', user.id).single()
  if (!buyer) redirect('/login')

  const { data: credits } = await db
    .from('credits')
    .select('*')
    .eq('buyer_id', buyer.id)
    .order('purchased_at', { ascending: false })

  const allCredits = credits || []
  const totalLeads = allCredits.filter(c => c.type === 'lead').reduce((s, c) => s + c.total_purchased - c.total_used, 0)
  const totalAppts = allCredits.filter(c => c.type === 'appointment').reduce((s, c) => s + c.total_purchased - c.total_used, 0)

  const leadPackages = PRODUCTS.lead.packages

  // Plano exato do assinante (mensal/trimestral/… só existe no metadata da assinatura Stripe)
  const isActiveSub = buyer.crm_subscription_status === 'active'
  let currentPlanKey: string | null = null
  let cancelAtEnd = false
  let periodEndTs: number | null = null
  if (isActiveSub && buyer.crm_subscription_id) {
    try {
      const sub: any = await getStripe().subscriptions.retrieve(buyer.crm_subscription_id)
      cancelAtEnd = !!sub.cancel_at_period_end
      periodEndTs = sub.current_period_end || sub.items?.data?.[0]?.current_period_end || null
      const meta = sub.metadata?.plan as string | undefined
      if (meta && getCrmPlan(meta)) {
        currentPlanKey = meta
      } else {
        // Fallback robusto: deriva o plano do PREÇO real (valor + intervalo + contagem)
        // quando o metadata está ausente (subs antigas/manuais). Assim o card "atual"
        // sempre aparece e não deixa "trocar" pro próprio plano.
        const price: any = sub.items?.data?.[0]?.price
        const amount = price?.unit_amount
        const interval = price?.recurring?.interval
        const count = price?.recurring?.interval_count || 1
        currentPlanKey = CRM_PLAN_LIST.find(p => p.amountCents === amount && p.interval === interval && p.intervalCount === count)?.key || null
      }
    } catch {}
  }
  const planLabelI18n: Record<string, [string, string]> = {
    mensal: ['Monthly', 'Mensual'],
    trimestral: ['Quarterly', 'Trimestral'],
    semestral: ['Semi-annual', 'Semestral'],
    anual: ['Annual', 'Anual'],
  }
  const rawPlanLabel = getCrmPlan(currentPlanKey)?.label || null
  const currentPlanLabel = currentPlanKey && planLabelI18n[currentPlanKey] && locale !== 'pt'
    ? (locale === 'en' ? planLabelI18n[currentPlanKey][0] : planLabelI18n[currentPlanKey][1])
    : rawPlanLabel
  const cancelDateStr = cancelAtEnd && periodEndTs ? new Date(periodEndTs * 1000).toLocaleDateString(dateLocale) : null

  return (
    <div className="max-w-[1040px]">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>{L('Creditos & Planos', 'Credits & Plans', 'Créditos y Planes')}</h1>
      <p className="text-[14px] mb-6" style={{ color: '#64748b' }}>{L('Compre leads ou assine o CRM Pro', 'Buy leads or subscribe to CRM Pro', 'Compra leads o suscríbete al CRM Pro')}</p>

      {/* CRM Pro — assinante ATIVO vê status + troca de plano; trial/free/expirado vê a grade dos 4 planos */}
      {isActiveSub ? (
        <div className="mb-8">
          <div className="rounded-2xl p-6 mb-5 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', border: 'none' }}>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#a78bfa' }}>{L('Plano CRM', 'CRM Plan', 'Plan CRM')}</p>
              <p className="text-[20px] font-extrabold" style={{ color: '#fff' }}>CRM Pro{currentPlanLabel ? ` — ${currentPlanLabel}` : ''}</p>
              <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{cancelDateStr
                ? L(`Cancelada — acesso até ${cancelDateStr}, sem renovação`, `Cancelled — access until ${cancelDateStr}, no renewal`, `Cancelada — acceso hasta ${cancelDateStr}, sin renovación`)
                : L('Pipeline, Time, Follow-ups, Anexos — tudo ativo', 'Pipeline, Team, Follow-ups, Attachments — all active', 'Pipeline, Equipo, Follow-ups, Archivos — todo activo')}</p>
            </div>
            <div className="flex items-center gap-3">
              {cancelDateStr ? (
                <span className="px-4 py-2 rounded-xl text-[12px] font-bold text-center" style={{ background: 'rgba(245,158,11,0.18)', color: '#fbbf24' }}>{L(`Cancela em ${cancelDateStr}`, `Cancels on ${cancelDateStr}`, `Se cancela el ${cancelDateStr}`)}</span>
              ) : (
                <span className="px-4 py-2 rounded-xl text-[12px] font-bold" style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>{L('Ativo', 'Active', 'Activo')}</span>
              )}
              <BillingPortalButton label={L('Gerenciar', 'Manage', 'Administrar')} />
            </div>
          </div>
          {buyer.crm_subscription_id ? (
            <>
              <h2 className="text-[16px] font-bold mb-1" style={{ color: '#1a1a2e' }}>{L('Trocar de plano', 'Change plan', 'Cambiar de plan')}</h2>
              <p className="text-[13px] mb-4" style={{ color: '#64748b' }}>{L(
                'Ao subir de plano, você paga só a diferença num checkout seguro e o novo ciclo começa na hora. Ao descer, a mudança vale já.',
                'When you upgrade, you only pay the difference in a secure checkout and the new cycle starts right away. When you downgrade, the change applies immediately.',
                'Al subir de plan, pagas solo la diferencia en un checkout seguro y el nuevo ciclo empieza al instante. Al bajar de plan, el cambio aplica de inmediato.'
              )}</p>
              <CrmChangePlan currentPlan={currentPlanKey} />
            </>
          ) : (
            <p className="text-[13px]" style={{ color: '#64748b' }}>{L(
              'Seu CRM Pro é cortesia / gerenciado manualmente — sem cobrança nem troca de plano por aqui.',
              'Your CRM Pro is complimentary / manually managed — no billing or plan changes here.',
              'Tu CRM Pro es cortesía / administrado manualmente — sin cobros ni cambios de plan por aquí.'
            )}</p>
          )}
        </div>
      ) : (
        <div className="mb-8">
          <h2 className="text-[16px] font-bold mb-1" style={{ color: '#1a1a2e' }}>{L('⚡ Assine o CRM Pro', '⚡ Subscribe to CRM Pro', '⚡ Suscríbete al CRM Pro')}</h2>
          <p className="text-[13px] mb-4" style={{ color: '#64748b' }}>
            {L(
              'Pipeline, Time, Follow-ups e Anexos. Quanto maior o compromisso, menor o $/mês.',
              'Pipeline, Team, Follow-ups and Attachments. The longer the commitment, the lower the $/mo.',
              'Pipeline, Equipo, Follow-ups y Archivos. Mientras más largo el compromiso, menor el $/mes.'
            )}
          </p>
          <CrmPlansGrid />
        </div>
      )}

      {params.success && (
        <div className="mb-6 px-5 py-4 rounded-xl text-[14px] font-semibold" style={{ background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0' }}>
          {L('✅ Pagamento confirmado! Seus creditos ja estao disponiveis.', '✅ Payment confirmed! Your credits are now available.', '✅ ¡Pago confirmado! Tus créditos ya están disponibles.')}
        </div>
      )}

      {/* Balance — o card de appointment só aparece pra quem AINDA tem saldo pago (fulfillment) */}
      <div className={`grid ${totalAppts > 0 ? 'grid-cols-2' : 'grid-cols-1'} gap-4 mb-8`}>
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{L('Leads Disponiveis', 'Available Leads', 'Leads Disponibles')}</p>
          <p className="text-[32px] font-extrabold mt-1" style={{ color: '#6366f1' }}>{totalLeads}</p>
        </div>
        {totalAppts > 0 && (
          <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
            <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{L('Appointments Disponiveis', 'Available Appointments', 'Appointments Disponibles')}</p>
            <p className="text-[32px] font-extrabold mt-1" style={{ color: '#f59e0b' }}>{totalAppts}</p>
            <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>{L('Saldo já pago — será entregue normalmente.', 'Already paid — will be delivered as usual.', 'Saldo ya pagado — se entregará normalmente.')}</p>
          </div>
        )}
      </div>

      {/* Lead Packages */}
      <h2 className="text-[16px] font-bold mb-4" style={{ color: '#1a1a2e' }}>{L('📋 Pacotes de Leads Exclusivos', '📋 Exclusive Lead Packages', '📋 Paquetes de Leads Exclusivos')}</h2>
      <PolicyCheck context="checkout_lead" />
      <CouponBox />
      <div className="grid grid-cols-3 gap-4 mb-8">
        {leadPackages.map((pkg) => {
          return (
            <div key={pkg.id} className="rounded-2xl p-6 relative" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
              <p className="text-[13px] font-medium" style={{ color: '#64748b' }}>{pkg.quantity} Leads</p>
              <p className="text-[32px] font-extrabold mt-1" style={{ color: '#1a1a2e' }}>${pkg.totalDisplay}</p>
              <p className="text-[12px]" style={{ color: '#94a3b8' }}>${pkg.pricePerUnit}/lead</p>
              <BuyButton packageId={pkg.id} color="#6366f1" />
            </div>
          )
        })}
      </div>

      {/* Cold Lead Packages */}
      <h2 className="text-[16px] font-bold mb-4" style={{ color: '#1a1a2e' }}>{L('❄️ Leads Frios (7+ dias)', '❄️ Cold Leads (7+ days)', '❄️ Leads Fríos (7+ días)')}</h2>
      <p className="text-[13px] mb-4" style={{ color: '#94a3b8' }}>{L('Leads que nao foram distribuidos a tempo. Preco reduzido, entrega imediata.', 'Leads that were not distributed in time. Reduced price, instant delivery.', 'Leads que no se distribuyeron a tiempo. Precio reducido, entrega inmediata.')}</p>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {PRODUCTS.cold_lead.packages.map((pkg) => (
          <div key={pkg.id} className="rounded-2xl p-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
            <p className="text-[13px] font-medium" style={{ color: '#64748b' }}>{pkg.quantity} {L('Leads Frios', 'Cold Leads', 'Leads Fríos')}</p>
            <p className="text-[32px] font-extrabold mt-1" style={{ color: '#1a1a2e' }}>${pkg.totalDisplay}</p>
            <p className="text-[12px]" style={{ color: '#94a3b8' }}>${pkg.pricePerUnit}/lead</p>
            <BuyButton packageId={pkg.id} color="#64748b" />
          </div>
        ))}
      </div>

      {/* Purchase History */}
      <h2 className="text-[16px] font-bold mb-4" style={{ color: '#1a1a2e' }}>{L('Historico de Compras', 'Purchase History', 'Historial de Compras')}</h2>
      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        {allCredits.length > 0 ? (
          <div>
            {allCredits.map((c, i) => (
              <div key={c.id} className="flex items-center gap-4 px-6 py-4" style={{ borderBottom: i < allCredits.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <span className="text-[20px]">{c.type === 'lead' ? '📋' : '📅'}</span>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold" style={{ color: '#1a1a2e' }}>
                    {c.total_purchased} {c.type === 'lead' ? 'Leads' : 'Appointments'}
                  </p>
                  <p className="text-[12px]" style={{ color: '#94a3b8' }}>
                    ${Number(c.price_per_unit).toFixed(0)}/{c.type === 'lead' ? 'lead' : 'appt'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold" style={{ color: '#10b981' }}>
                    {c.total_purchased - c.total_used} {locale === 'en' ? 'left' : (c.total_purchased - c.total_used !== 1 ? 'restantes' : 'restante')}
                  </p>
                  <p className="text-[11px]" style={{ color: '#94a3b8' }}>
                    {c.total_used} {locale === 'en' ? 'used' : (c.total_used !== 1 ? 'usados' : 'usado')}
                  </p>
                </div>
                <span className="text-[11px]" style={{ color: '#94a3b8' }}>
                  {new Date(c.purchased_at).toLocaleDateString(dateLocale)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-[13px]" style={{ color: '#94a3b8' }}>{L('Nenhuma compra ainda', 'No purchases yet', 'Aún no hay compras')}</div>
        )}
      </div>
    </div>
  )
}
