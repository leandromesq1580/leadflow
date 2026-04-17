import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRODUCTS } from '@/lib/stripe'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BuyButton } from './buy-button'
import { CrmSubscribeButton } from './crm-subscribe-button'
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
  const { data: buyer } = await db.from('buyers').select('id, crm_plan, crm_subscription_status').eq('auth_user_id', user.id).single()
  if (!buyer) redirect('/login')

  const { data: credits } = await db
    .from('credits')
    .select('*')
    .eq('buyer_id', buyer.id)
    .order('purchased_at', { ascending: false })

  const allCredits = credits || []
  const totalLeads = allCredits.filter(c => c.type === 'lead').reduce((s, c) => s + c.total_purchased - c.total_used, 0)
  const totalAppts = allCredits.filter(c => c.type === 'appointment').reduce((s, c) => s + c.total_purchased - c.total_used, 0)

  return (
    <div className="max-w-[1040px]">
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>Creditos & Planos</h1>
      <p className="text-[14px] mb-6" style={{ color: '#64748b' }}>Compre leads ou assine o CRM Pro</p>

      {/* CRM Plan card */}
      <div className="rounded-2xl p-6 mb-6 flex items-center justify-between" style={{
        background: buyer?.crm_plan === 'pro' ? 'linear-gradient(135deg, #1e1b4b, #312e81)' : '#fff',
        border: buyer?.crm_plan === 'pro' ? 'none' : '1px solid #e8ecf4',
      }}>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: buyer?.crm_plan === 'pro' ? '#a78bfa' : '#94a3b8' }}>Plano CRM</p>
          <p className="text-[20px] font-extrabold" style={{ color: buyer?.crm_plan === 'pro' ? '#fff' : '#1a1a2e' }}>
            {buyer?.crm_plan === 'pro' ? 'CRM Pro — $99/mes' : 'Gratis'}
          </p>
          <p className="text-[12px] mt-1" style={{ color: buyer?.crm_plan === 'pro' ? 'rgba(255,255,255,0.5)' : '#94a3b8' }}>
            {buyer?.crm_plan === 'pro' ? 'Pipeline, Time, Follow-ups, Anexos — tudo ativo' : 'Pipeline e Time requerem plano CRM Pro'}
          </p>
        </div>
        {buyer?.crm_plan !== 'pro' && (
          <CrmSubscribeButton />
        )}
        {buyer?.crm_plan === 'pro' && (
          <div className="flex items-center gap-3">
            <span className="px-4 py-2 rounded-xl text-[12px] font-bold" style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>Ativo</span>
            <BillingPortalButton label="Gerenciar" />
          </div>
        )}
      </div>

      {params.success && (
        <div className="mb-6 px-5 py-4 rounded-xl text-[14px] font-semibold" style={{ background: '#ecfdf5', color: '#10b981', border: '1px solid #a7f3d0' }}>
          ✅ Pagamento confirmado! Seus creditos ja estao disponiveis.
        </div>
      )}

      {/* Balance */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Leads Disponiveis</p>
          <p className="text-[32px] font-extrabold mt-1" style={{ color: '#6366f1' }}>{totalLeads}</p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Appointments Disponiveis</p>
          <p className="text-[32px] font-extrabold mt-1" style={{ color: '#f59e0b' }}>{totalAppts}</p>
        </div>
      </div>

      {/* Lead Packages */}
      <h2 className="text-[16px] font-bold mb-4" style={{ color: '#1a1a2e' }}>📋 Pacotes de Leads Exclusivos</h2>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {PRODUCTS.lead.packages.map((pkg) => (
          <div key={pkg.id} className="rounded-2xl p-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
            <p className="text-[13px] font-medium" style={{ color: '#64748b' }}>{pkg.quantity} Leads</p>
            <p className="text-[32px] font-extrabold mt-1" style={{ color: '#1a1a2e' }}>${pkg.totalDisplay}</p>
            <p className="text-[12px]" style={{ color: '#94a3b8' }}>${pkg.pricePerUnit}/lead</p>
            <BuyButton packageId={pkg.id} color="#6366f1" />
          </div>
        ))}
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

      {/* Appointment Packages */}
      <h2 className="text-[16px] font-bold mb-4" style={{ color: '#1a1a2e' }}>📅 Pacotes de Appointments</h2>
      <div className="grid grid-cols-2 gap-4 mb-8">
        {PRODUCTS.appointment.packages.map((pkg) => (
          <div key={pkg.id} className="rounded-2xl p-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
            <p className="text-[13px] font-medium" style={{ color: '#64748b' }}>{pkg.quantity} Appointments</p>
            <p className="text-[32px] font-extrabold mt-1" style={{ color: '#1a1a2e' }}>${pkg.totalDisplay}</p>
            <p className="text-[12px]" style={{ color: '#94a3b8' }}>${pkg.pricePerUnit}/appointment</p>
            <BuyButton packageId={pkg.id} color="#f59e0b" />
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
