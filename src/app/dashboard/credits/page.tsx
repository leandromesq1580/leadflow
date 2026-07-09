import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRODUCTS, getStripe } from '@/lib/stripe'
import { STARTER_PACKAGE_ID, hasPurchased } from '@/lib/starter'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BuyButton } from './buy-button'
import { CrmPlansGrid } from '@/app/dashboard/planos/crm-plans-grid'
import { CrmChangePlan } from './crm-change-plan'
import { getCrmPlan, CRM_PLAN_LIST } from '@/lib/crm-plans'
import { BillingPortalButton } from '@/components/billing-portal-button'

export const dynamic = 'force-dynamic'

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; cancelled?: string }>
}) {
  const params = await searchParams
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

  // Starter só aparece pra quem nunca comprou (oferta de 1ª compra)
  const starterEligible = !(await hasPurchased(db, buyer.id))
  const leadPackages = PRODUCTS.lead.packages.filter(p => p.id !== STARTER_PACKAGE_ID || starterEligible)

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
  const currentPlanLabel = getCrmPlan(currentPlanKey)?.label || null
  const cancelDateStr = cancelAtEnd && periodEndTs ? new Date(periodEndTs * 1000).toLocaleDateString('pt-BR') : null

  return (
    <div className="max-w-[1040px]">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>Creditos & Planos</h1>
      <p className="text-[14px] mb-6" style={{ color: '#64748b' }}>Compre leads ou assine o CRM Pro</p>

      {/* CRM Pro — assinante ATIVO vê status + troca de plano; trial/free/expirado vê a grade dos 4 planos */}
      {isActiveSub ? (
        <div className="mb-8">
          <div className="rounded-2xl p-6 mb-5 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #1e1b4b, #312e81)', border: 'none' }}>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#a78bfa' }}>Plano CRM</p>
              <p className="text-[20px] font-extrabold" style={{ color: '#fff' }}>CRM Pro{currentPlanLabel ? ` — ${currentPlanLabel}` : ''}</p>
              <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{cancelDateStr ? `Cancelada — acesso até ${cancelDateStr}, sem renovação` : 'Pipeline, Time, Follow-ups, Anexos — tudo ativo'}</p>
            </div>
            <div className="flex items-center gap-3">
              {cancelDateStr ? (
                <span className="px-4 py-2 rounded-xl text-[12px] font-bold text-center" style={{ background: 'rgba(245,158,11,0.18)', color: '#fbbf24' }}>Cancela em {cancelDateStr}</span>
              ) : (
                <span className="px-4 py-2 rounded-xl text-[12px] font-bold" style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>Ativo</span>
              )}
              <BillingPortalButton label="Gerenciar" />
            </div>
          </div>
          {buyer.crm_subscription_id ? (
            <>
              <h2 className="text-[16px] font-bold mb-1" style={{ color: '#1a1a2e' }}>Trocar de plano</h2>
              <p className="text-[13px] mb-4" style={{ color: '#64748b' }}>Ao subir de plano, você paga só a diferença num checkout seguro e o novo ciclo começa na hora. Ao descer, a mudança vale já.</p>
              <CrmChangePlan currentPlan={currentPlanKey} />
            </>
          ) : (
            <p className="text-[13px]" style={{ color: '#64748b' }}>Seu CRM Pro é cortesia / gerenciado manualmente — sem cobrança nem troca de plano por aqui.</p>
          )}
        </div>
      ) : (
        <div className="mb-8">
          <h2 className="text-[16px] font-bold mb-1" style={{ color: '#1a1a2e' }}>⚡ Assine o CRM Pro</h2>
          <p className="text-[13px] mb-4" style={{ color: '#64748b' }}>
            Pipeline, Time, Follow-ups e Anexos + <b>5 leads exclusivos por mês</b>. Quanto maior o compromisso, menor o $/mês.
          </p>
          <CrmPlansGrid />
        </div>
      )}

      {params.success && (
        <div className="mb-6 px-5 py-4 rounded-xl text-[14px] font-semibold" style={{ background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0' }}>
          ✅ Pagamento confirmado! Seus creditos ja estao disponiveis.
        </div>
      )}

      {/* Balance — o card de appointment só aparece pra quem AINDA tem saldo pago (fulfillment) */}
      <div className={`grid ${totalAppts > 0 ? 'grid-cols-2' : 'grid-cols-1'} gap-4 mb-8`}>
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Leads Disponiveis</p>
          <p className="text-[32px] font-extrabold mt-1" style={{ color: '#6366f1' }}>{totalLeads}</p>
        </div>
        {totalAppts > 0 && (
          <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
            <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Appointments Disponiveis</p>
            <p className="text-[32px] font-extrabold mt-1" style={{ color: '#f59e0b' }}>{totalAppts}</p>
            <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>Saldo já pago — será entregue normalmente.</p>
          </div>
        )}
      </div>

      {/* Lead Packages */}
      <h2 className="text-[16px] font-bold mb-4" style={{ color: '#1a1a2e' }}>📋 Pacotes de Leads Exclusivos</h2>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {leadPackages.map((pkg) => {
          const isStarter = pkg.id === STARTER_PACKAGE_ID
          return (
            <div key={pkg.id} className="rounded-2xl p-6 relative" style={{ background: '#fff', border: isStarter ? '2px solid #10b981' : '1px solid #e8ecf4' }}>
              {isStarter && (
                <span className="absolute -top-3 left-5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold text-white" style={{ background: '#10b981' }}>SÓ NA 1ª COMPRA</span>
              )}
              <p className="text-[13px] font-medium" style={{ color: '#64748b' }}>{pkg.quantity} Leads</p>
              <p className="text-[32px] font-extrabold mt-1" style={{ color: '#1a1a2e' }}>${pkg.totalDisplay}</p>
              <p className="text-[12px]" style={{ color: '#94a3b8' }}>${pkg.pricePerUnit}/lead</p>
              <BuyButton packageId={pkg.id} color={isStarter ? '#10b981' : '#6366f1'} />
            </div>
          )
        })}
      </div>

      {/* Cold Lead Packages */}
      <h2 className="text-[16px] font-bold mb-4" style={{ color: '#1a1a2e' }}>❄️ Leads Frios (7+ dias)</h2>
      <p className="text-[13px] mb-4" style={{ color: '#94a3b8' }}>Leads que nao foram distribuidos a tempo. Preco reduzido, entrega imediata.</p>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {PRODUCTS.cold_lead.packages.map((pkg) => (
          <div key={pkg.id} className="rounded-2xl p-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
            <p className="text-[13px] font-medium" style={{ color: '#64748b' }}>{pkg.quantity} Leads Frios</p>
            <p className="text-[32px] font-extrabold mt-1" style={{ color: '#1a1a2e' }}>${pkg.totalDisplay}</p>
            <p className="text-[12px]" style={{ color: '#94a3b8' }}>${pkg.pricePerUnit}/lead</p>
            <BuyButton packageId={pkg.id} color="#64748b" />
          </div>
        ))}
      </div>

      {/* Purchase History */}
      <h2 className="text-[16px] font-bold mb-4" style={{ color: '#1a1a2e' }}>Historico de Compras</h2>
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
                    {c.total_purchased - c.total_used} restante{c.total_purchased - c.total_used !== 1 ? 's' : ''}
                  </p>
                  <p className="text-[11px]" style={{ color: '#94a3b8' }}>
                    {c.total_used} usado{c.total_used !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="text-[11px]" style={{ color: '#94a3b8' }}>
                  {new Date(c.purchased_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-[13px]" style={{ color: '#94a3b8' }}>Nenhuma compra ainda</div>
        )}
      </div>
    </div>
  )
}
