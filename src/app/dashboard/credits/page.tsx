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
import { buildPurchaseHistory, type PurchaseHistoryItem } from '@/lib/purchase-history'
import { readSalesTeamPricing, purchaseUnitPrice } from '@/lib/sales-team-pricing'
import { SalesTeamPriceNotice } from '@/components/sales-team-price-notice'

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

  const [creditsRes, paymentsRes] = await Promise.all([
    db.from('credits')
      .select('id, type, total_purchased, total_used, price_per_unit, purchased_at, stripe_payment_id')
      .eq('buyer_id', buyer.id)
      .order('purchased_at', { ascending: false }),
    db.from('payments')
      .select('id, amount, product_type, quantity, price_per_unit, status, created_at, stripe_session_id, stripe_payment_intent_id')
      .eq('buyer_id', buyer.id)
      .order('created_at', { ascending: false }),
  ])

  const allCredits = creditsRes.data || []
  const purchaseHistory = buildPurchaseHistory(paymentsRes.data || [], allCredits)
  const totalLeads = allCredits.filter(c => c.type === 'lead').reduce((s, c) => s + c.total_purchased - c.total_used, 0)
  const totalAppts = allCredits.filter(c => c.type === 'appointment').reduce((s, c) => s + c.total_purchased - c.total_used, 0)

  const teamPricing = await readSalesTeamPricing(db, buyer.id)
  const leadPackages = PRODUCTS.lead.packages.map(pkg => {
    const quote = purchaseUnitPrice('lead', pkg.unitPriceCents, teamPricing)
    return { ...pkg, pricePerUnit: quote.unitPriceCents / 100, totalDisplay: quote.unitPriceCents * pkg.quantity / 100 }
  })

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
  const localizedPlanLabel = (key: string) => {
    const plan = getCrmPlan(key)
    if (!plan) return null
    if (locale === 'pt') return plan.label
    return locale === 'en' ? planLabelI18n[key]?.[0] : planLabelI18n[key]?.[1]
  }
  const purchaseLabel = (purchase: PurchaseHistoryItem) => {
    let label: string
    if (purchase.productType === 'crm') {
      const plan = CRM_PLAN_LIST.find(p => p.amountCents === Math.round(purchase.amount * 100))
      const planLabel = plan ? localizedPlanLabel(plan.key) : null
      label = `CRM Pro${planLabel ? ` — ${planLabel}` : ''}`
    } else if (purchase.productType === 'appointment') {
      label = `${purchase.quantity} ${L('agendamentos', 'appointments', 'citas')}`
    } else if (purchase.productType === 'cold_lead') {
      label = `${purchase.quantity} ${L('Leads Frios', 'Cold Leads', 'Leads Fríos')}`
    } else {
      label = `${purchase.quantity} Leads`
    }
    if (purchase.source === 'manual_credit') return `${L('Cortesia', 'Courtesy', 'Cortesía')} · ${label}`
    if (purchase.source === 'bonus_credit') return `${L('Bônus CRM', 'CRM Bonus', 'Bono CRM')} · ${label}`
    return label
  }
  const purchaseStatus = (purchase: PurchaseHistoryItem) => {
    if (purchase.status === 'refunded') return L('Reembolsado', 'Refunded', 'Reembolsado')
    if (purchase.status === 'pending') return L('Pendente', 'Pending', 'Pendiente')
    if (purchase.status === 'courtesy') return L('Cortesia', 'Courtesy', 'Cortesía')
    if (purchase.status === 'bonus') return L('Bônus', 'Bonus', 'Bono')
    return L('Pago', 'Paid', 'Pagado')
  }

  return (
    <div className="max-w-[1040px]">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: 'var(--fg)' }}>{L('Creditos & Planos', 'Credits & Plans', 'Créditos y Planes')}</h1>
      <p className="text-[14px] mb-6" style={{ color: 'var(--fg-secondary)' }}>{L('Compre leads ou assine o CRM Pro', 'Buy leads or subscribe to CRM Pro', 'Compra leads o suscríbete al CRM Pro')}</p>

      {/* CRM Pro — assinante ATIVO vê status + troca de plano; trial/free/expirado vê a grade dos 4 planos */}
      {isActiveSub ? (
        <div className="mb-8">
          <div className="rounded-2xl p-6 mb-5 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #190f3a, #3b1d7a)', border: 'none' }}>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#a78bfa' }}>{L('Plano CRM', 'CRM Plan', 'Plan CRM')}</p>
              <p className="text-[20px] font-extrabold" style={{ color: '#fff' }}>CRM Pro{currentPlanLabel ? ` — ${currentPlanLabel}` : ''}</p>
              <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{cancelDateStr
                ? L(`Cancelada — acesso até ${cancelDateStr}, sem renovação`, `Cancelled — access until ${cancelDateStr}, no renewal`, `Cancelada — acceso hasta ${cancelDateStr}, sin renovación`)
                : L('Renovação automática ativa · cancele a próxima cobrança quando quiser', 'Automatic renewal active · cancel the next charge anytime', 'Renovación automática activa · cancela el próximo cobro cuando quieras')}</p>
            </div>
            <div className="flex items-center gap-3">
              {cancelDateStr ? (
                <span className="px-4 py-2 rounded-xl text-[12px] font-bold text-center" style={{ background: 'rgba(245,158,11,0.18)', color: '#fbbf24' }}>{L(`Cancela em ${cancelDateStr}`, `Cancels on ${cancelDateStr}`, `Se cancela el ${cancelDateStr}`)}</span>
              ) : (
                <span className="px-4 py-2 rounded-xl text-[12px] font-bold" style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>{L('Ativo', 'Active', 'Activo')}</span>
              )}
              <BillingPortalButton
                returnPath="/dashboard/credits"
                label={L('Gerenciar ou cancelar', 'Manage or cancel', 'Gestionar o cancelar')}
              />
            </div>
          </div>
          {buyer.crm_subscription_id ? (
            <>
              <h2 className="text-[16px] font-bold mb-1" style={{ color: 'var(--fg)' }}>{L('Trocar de plano', 'Change plan', 'Cambiar de plan')}</h2>
              <p className="text-[13px] mb-4" style={{ color: 'var(--fg-secondary)' }}>{L(
                'Ao subir de plano, você paga só a diferença num checkout seguro e o novo ciclo começa na hora. Ao descer, a mudança vale já.',
                'When you upgrade, you only pay the difference in a secure checkout and the new cycle starts right away. When you downgrade, the change applies immediately.',
                'Al subir de plan, pagas solo la diferencia en un checkout seguro y el nuevo ciclo empieza al instante. Al bajar de plan, el cambio aplica de inmediato.'
              )}</p>
              <CrmChangePlan currentPlan={currentPlanKey} />
            </>
          ) : (
            <p className="text-[13px]" style={{ color: 'var(--fg-secondary)' }}>{L(
              'Seu CRM Pro é cortesia / gerenciado manualmente — sem cobrança nem troca de plano por aqui.',
              'Your CRM Pro is complimentary / manually managed — no billing or plan changes here.',
              'Tu CRM Pro es cortesía / administrado manualmente — sin cobros ni cambios de plan por aquí.'
            )}</p>
          )}
        </div>
      ) : (
        <div className="mb-8">
          <h2 className="text-[16px] font-bold mb-1" style={{ color: 'var(--fg)' }}>{L('⚡ Assine o CRM Pro', '⚡ Subscribe to CRM Pro', '⚡ Suscríbete al CRM Pro')}</h2>
          <p className="text-[13px] mb-4" style={{ color: 'var(--fg-secondary)' }}>
            {L(
              'Funil de vendas, equipe, acompanhamentos e anexos. Quanto maior o compromisso, menor o valor mensal.',
              'Pipeline, Team, Follow-ups and Attachments. The longer the commitment, the lower the $/mo.',
              'Flujo de ventas, equipo, seguimientos y archivos. Cuanto más largo sea el compromiso, menor será el precio mensual.'
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
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>{L('Leads Disponiveis', 'Available Leads', 'Leads Disponibles')}</p>
          <p className="text-[32px] font-extrabold mt-1" style={{ color: 'var(--accent)' }}>{totalLeads}</p>
        </div>
        {totalAppts > 0 && (
          <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>{L('Agendamentos disponíveis', 'Available appointments', 'Citas disponibles')}</p>
            <p className="text-[32px] font-extrabold mt-1" style={{ color: '#f59e0b' }}>{totalAppts}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--fg-muted)' }}>{L('Saldo já pago — será entregue normalmente.', 'Already paid — will be delivered as usual.', 'Saldo ya pagado — se entregará normalmente.')}</p>
          </div>
        )}
      </div>

      {/* Lead Packages */}
      <h2 className="text-[16px] font-bold mb-4" style={{ color: 'var(--fg)' }}>{L('📋 Pacotes de Leads Exclusivos', '📋 Exclusive Lead Packages', '📋 Paquetes de Leads Exclusivos')}</h2>
      {teamPricing.is_member && <SalesTeamPriceNotice cents={teamPricing.lead_unit_price_cents} locale={locale} />}
      <PolicyCheck context="checkout_lead" />
      <CouponBox />
      <div className="grid grid-cols-3 gap-4 mb-8">
        {leadPackages.map((pkg) => {
          return (
            <div key={pkg.id} className="rounded-2xl p-6 relative" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <p className="text-[13px] font-medium" style={{ color: 'var(--fg-secondary)' }}>{pkg.quantity} Leads</p>
              <p className="text-[32px] font-extrabold mt-1" style={{ color: 'var(--fg)' }}>${pkg.totalDisplay}</p>
              <p className="text-[12px]" style={{ color: 'var(--fg-muted)' }}>${pkg.pricePerUnit}/lead</p>
              <BuyButton packageId={pkg.id} color="var(--accent)" />
            </div>
          )
        })}
      </div>

      {/* Cold Lead Packages */}
      <h2 className="text-[16px] font-bold mb-4" style={{ color: 'var(--fg)' }}>{L('❄️ Leads Frios (7+ dias)', '❄️ Cold Leads (7+ days)', '❄️ Leads Fríos (7+ días)')}</h2>
      <p className="text-[13px] mb-4" style={{ color: 'var(--fg-muted)' }}>{L('Leads que nao foram distribuidos a tempo. Preco reduzido, entrega imediata.', 'Leads that were not distributed in time. Reduced price, instant delivery.', 'Leads que no se distribuyeron a tiempo. Precio reducido, entrega inmediata.')}</p>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {PRODUCTS.cold_lead.packages.map((pkg) => (
          <div key={pkg.id} className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-[13px] font-medium" style={{ color: 'var(--fg-secondary)' }}>{pkg.quantity} {L('Leads Frios', 'Cold Leads', 'Leads Fríos')}</p>
            <p className="text-[32px] font-extrabold mt-1" style={{ color: 'var(--fg)' }}>${pkg.totalDisplay}</p>
            <p className="text-[12px]" style={{ color: 'var(--fg-muted)' }}>${pkg.pricePerUnit}/lead</p>
            <BuyButton packageId={pkg.id} color="#64748b" />
          </div>
        ))}
      </div>

      {/* Unified purchase history: paid packages + CRM subscriptions + credit adjustments */}
      <h2 className="text-[16px] font-bold mb-4" style={{ color: 'var(--fg)' }}>{L('Histórico de Compras e Assinaturas', 'Purchase & Subscription History', 'Historial de Compras y Suscripciones')}</h2>
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {purchaseHistory.length > 0 ? (
          <div>
            {purchaseHistory.map((purchase, i) => {
              const isRefunded = purchase.status === 'refunded'
              const isPending = purchase.status === 'pending'
              return (
                <div key={purchase.id} className="flex items-center gap-4 px-6 py-4" style={{ borderBottom: i < purchaseHistory.length - 1 ? '1px solid var(--bg-soft)' : 'none' }}>
                  <span className="text-[20px]">{purchase.productType === 'crm' ? '💳' : purchase.productType === 'appointment' ? '📅' : purchase.productType === 'cold_lead' ? '❄️' : purchase.source === 'manual_credit' ? '🎁' : '📋'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold" style={{ color: 'var(--fg)' }}>{purchaseLabel(purchase)}</p>
                    <p className="text-[12px]" style={{ color: 'var(--fg-muted)' }}>
                      {new Date(purchase.purchasedAt).toLocaleDateString(dateLocale)} · {purchaseStatus(purchase)}
                      {purchase.note ? ` · ${purchase.note}` : ''}
                    </p>
                  </div>
                  {purchase.remaining !== null && (
                    <div className="text-right hidden sm:block">
                      <p className="text-[13px] font-bold" style={{ color: '#10b981' }}>{purchase.remaining} {L('restantes', 'left', 'restantes')}</p>
                      <p className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>{purchase.totalUsed} {L('usados', 'used', 'usados')}</p>
                    </div>
                  )}
                  <div className="text-right min-w-[82px]">
                    <p className="text-[14px] font-bold" style={{ color: isRefunded ? '#ef4444' : isPending ? '#f59e0b' : purchase.source === 'payment' ? '#10b981' : 'var(--fg-muted)' }}>
                      {purchase.source === 'payment' ? `$${purchase.amount.toFixed(2)}` : purchaseStatus(purchase)}
                    </p>
                    {purchase.source === 'payment' && purchase.productType !== 'crm' && purchase.quantity > 0 && (
                      <p className="text-[11px]" style={{ color: 'var(--fg-muted)' }}>${purchase.pricePerUnit.toFixed(2)}/{L('un.', 'unit', 'un.')}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-[13px]" style={{ color: 'var(--fg-muted)' }}>{L('Nenhuma compra ainda', 'No purchases yet', 'Aún no hay compras')}</div>
        )}
      </div>
    </div>
  )
}
