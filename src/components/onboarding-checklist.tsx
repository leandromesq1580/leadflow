import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { DismissButton } from './dismiss-button'

interface Props { buyerId: string }

export async function OnboardingChecklist({ buyerId }: Props) {
  const db = createAdminClient()

  const { data: buyer } = await db.from('buyers')
    .select('onboarding_completed_at, onboarding_dismissed, crm_plan, is_agency')
    .eq('id', buyerId).single()

  if (!buyer || buyer.onboarding_dismissed) return null

  const [statesRes, creditsRes, membersRes] = await Promise.all([
    db.from('buyer_states').select('state_code').eq('buyer_id', buyerId),
    db.from('credits').select('id').eq('buyer_id', buyerId).limit(1),
    db.from('team_members').select('id').eq('buyer_id', buyerId).limit(1),
  ])

  const hasStates = (statesRes.data?.length ?? 0) > 0
  const hasCredits = (creditsRes.data?.length ?? 0) > 0
  const hasTeam = (membersRes.data?.length ?? 0) > 0
  const hasCrm = buyer.crm_plan === 'pro'

  const items = [
    { done: true, label: 'Conta criada', desc: 'Welcome aboard!', href: null },
    { done: hasStates, label: 'Configure seus estados', desc: 'Pra receber leads dos estados onde tem licenca', href: '/dashboard/settings' },
    { done: hasCredits, label: 'Compre seu primeiro pacote', desc: 'Comece com 10 leads exclusivos por $220', href: '/dashboard/credits' },
    { done: hasCrm, label: 'Ative o CRM Pro', desc: 'Pipeline + Time + Follow-ups por $99/mes', href: '/dashboard/credits' },
    { done: hasTeam, label: 'Monte seu time (opcional)', desc: 'Adicione agentes e distribua leads automaticamente', href: '/dashboard/team' },
  ]

  const completed = items.filter(i => i.done).length
  const total = items.length

  // Auto-hide if all done
  if (completed === total) return null

  const pct = Math.round((completed / total) * 100)

  return (
    <div className="rounded-2xl mb-6 overflow-hidden" style={{ background: 'linear-gradient(135deg, #fff, #f8f9fc)', border: '1px solid #e8ecf4', boxShadow: '0 4px 14px rgba(99,102,241,0.06)' }}>
      <div className="px-6 pt-5 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f1f5f9' }}>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#6366f1' }}>Progresso da configuracao</p>
          <p className="text-[16px] font-extrabold mt-0.5" style={{ color: '#1a1a2e' }}>{completed} de {total} completos</p>
        </div>
        <DismissButton />
      </div>

      {/* Progress bar */}
      <div className="px-6 pt-3">
        <div className="h-2 rounded-full" style={{ background: '#f1f5f9' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
        </div>
      </div>

      {/* Items */}
      <div className="px-6 py-4 space-y-2">
        {items.map((item, i) => (
          <div key={i}>
            {item.href && !item.done ? (
              <Link href={item.href} className="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all hover:bg-indigo-50/50">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2"
                  style={{ borderColor: '#e8ecf4', background: '#fff' }}>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold" style={{ color: '#1a1a2e' }}>{item.label}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>{item.desc}</p>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-md" style={{ background: '#eef2ff', color: '#6366f1' }}>Fazer</span>
              </Link>
            ) : (
              <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl" style={{ opacity: item.done ? 0.6 : 1 }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: item.done ? '#10b981' : '#f1f5f9' }}>
                  {item.done && <span className="text-white text-[12px]">✓</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold" style={{ color: '#1a1a2e', textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>{item.desc}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
