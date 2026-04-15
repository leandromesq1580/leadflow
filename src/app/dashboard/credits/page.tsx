import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRODUCTS } from '@/lib/stripe'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BuyButton } from './buy-button'

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
  const { data: buyer } = await db.from('buyers').select('id').eq('auth_user_id', user.id).single()
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
      <h1 className="text-[24px] font-extrabold mb-1" style={{ color: '#1a1a2e' }}>Creditos</h1>
      <p className="text-[14px] mb-6" style={{ color: '#64748b' }}>Compre creditos para receber leads ou appointments</p>

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
