'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

interface Buyer {
  id: string; name: string; email: string; phone: string
  is_active: boolean; is_admin: boolean; crm_plan: string; is_agency: boolean; is_staff?: boolean
  tier: 'paying' | 'trial' | 'free'; subStatus: string | null; crmPaying: boolean
  initials: string; avatarHue: number; states: string[]
  leadCredits: number; apptCredits: number; leadsReceived: number
}

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'staff', label: 'Funcionários' },
  { key: 'paying', label: '💚 Pagantes' },
  { key: 'trial', label: '🟡 Trial' },
  { key: 'pro', label: 'CRM Pro' },
  { key: 'crm_paying', label: '💳 CRM pagante' },
  { key: 'agency', label: 'Agencias' },
  { key: 'no_credits', label: 'Sem creditos' },
  { key: 'no_states', label: 'Sem estados' },
  { key: 'inactive', label: 'Inativos' },
]

const TIER_BADGE: Record<Buyer['tier'], { label: string; bg: string; fg: string }> = {
  paying: { label: 'Pagante', bg: '#dcfce7', fg: '#15803d' },
  trial: { label: 'Trial', bg: '#fef3c7', fg: '#b45309' },
  free: { label: 'Free', bg: '#f1f5f9', fg: '#64748b' },
}

export function BuyersList({ buyers: initial }: { buyers: Buyer[] }) {
  const [buyers, setBuyers] = useState<Buyer[]>(initial)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(e: React.MouseEvent, b: Buyer) {
    e.preventDefault(); e.stopPropagation()
    if (deleting) return
    const warn = b.tier === 'paying'
      ? `⚠️ ${b.name} é PAGANTE. Apagar remove o cadastro, o login e os créditos dele (os leads recebidos viram não-atribuídos).`
      : `Apagar ${b.name}? Remove o cadastro, o login e os dados dele. Os leads recebidos viram não-atribuídos.`
    if (!confirm(`${warn}\n\nEssa ação NÃO tem como desfazer. Confirmar?`)) return
    setDeleting(b.id)
    try {
      const r = await fetch(`/api/admin/buyers/${b.id}/delete`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { alert(d.error || 'Falha ao apagar'); setDeleting(null); return }
      setBuyers(prev => prev.filter(x => x.id !== b.id))
    } catch {
      alert('Erro de rede ao apagar')
    } finally {
      setDeleting(null)
    }
  }

  const filtered = useMemo(() => buyers.filter(b => {
    if (search) {
      const q = search.toLowerCase()
      if (!b.name.toLowerCase().includes(q) && !b.email.toLowerCase().includes(q) && !b.phone?.includes(q)) return false
    }
    if (filter === 'staff' && !b.is_staff) return false
    if (filter === 'paying' && b.tier !== 'paying') return false
    if (filter === 'trial' && b.tier !== 'trial') return false
    if (filter === 'pro' && b.crm_plan !== 'pro') return false
    if (filter === 'crm_paying' && !b.crmPaying) return false
    if (filter === 'agency' && !b.is_agency) return false
    if (filter === 'no_credits' && (b.leadCredits > 0 || b.apptCredits > 0)) return false
    if (filter === 'no_states' && b.states.length > 0) return false
    if (filter === 'inactive' && b.is_active) return false
    return true
  }), [buyers, search, filter])

  const counts = {
    pro: buyers.filter(b => b.crm_plan === 'pro').length,
    crmPaying: buyers.filter(b => b.crmPaying).length,
    agency: buyers.filter(b => b.is_agency).length,
    paying: buyers.filter(b => b.tier === 'paying').length,
    trial: buyers.filter(b => b.tier === 'trial').length,
  }

  return (
    <div className="max-w-[1100px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Compradores</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>
            {buyers.length} cadastrados · <b style={{ color: '#15803d' }}>{counts.paying} pagantes</b> · <span style={{ color: '#b45309' }}>{counts.trial} trial</span> · {counts.pro} CRM Pro · <b style={{ color: '#15803d' }}>{counts.crmPaying} CRM pagante</b> · {counts.agency} agencias
          </p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, email ou telefone..."
          className="flex-1 min-w-[220px] px-4 py-2.5 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
          style={{ background: '#fff', border: '1px solid #e8ecf4' }} />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="px-3.5 py-2 rounded-lg text-[12px] font-bold transition-all"
            style={{
              background: filter === f.key ? '#6366f1' : '#fff',
              color: filter === f.key ? '#fff' : '#64748b',
              border: `1px solid ${filter === f.key ? '#6366f1' : '#e8ecf4'}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        {filtered.length > 0 ? (
          <div>
            {filtered.map((b, i) => (
              <Link
                key={b.id}
                href={`/admin/buyers/${b.id}`}
                className="flex items-center gap-4 px-5 py-3.5 group hover:bg-slate-50 transition-colors"
                style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                  style={{ background: `hsl(${b.avatarHue}, 65%, 55%)` }}>
                  {b.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-semibold truncate group-hover:text-indigo-600" style={{ color: '#1a1a2e' }}>{b.name}</p>
                    {b.is_admin && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: '#fef2f2', color: '#dc2626' }}>Admin</span>}
                    {b.is_staff && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#eef2ff', color: '#4338ca' }} title="Fora da fila normal. Recebe apenas pela prioridade explícita do administrador.">Funcionário</span>}
                    {b.crm_plan === 'pro' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: 'linear-gradient(135deg, #a78bfa, #6366f1)', color: '#fff' }}>Pro</span>}
                    {b.is_agency && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: '#fef3c7', color: '#92400e' }}>Agency</span>}
                  </div>
                  <p className="text-[11px] truncate" style={{ color: '#94a3b8' }}>{b.email}</p>
                </div>

                <div className="hidden md:flex gap-1 max-w-[160px] flex-wrap">
                  {b.states.slice(0, 4).map((s: string) => (
                    <span key={s} className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: '#eef2ff', color: '#6366f1' }}>{s}</span>
                  ))}
                  {b.states.length > 4 && <span className="text-[10px] font-bold" style={{ color: '#94a3b8' }}>+{b.states.length - 4}</span>}
                  {b.states.length === 0 && <span className="text-[10px] font-bold" style={{ color: '#f59e0b' }}>Sem estado</span>}
                </div>

                <div className="text-right hidden sm:block">
                  <p className="text-[13px] font-bold" style={{ color: b.leadCredits > 0 ? '#10b981' : '#94a3b8' }}>{b.leadCredits} {b.is_staff ? 'créditos internos' : 'leads'}</p>
                  <p className="text-[10px]" style={{ color: '#94a3b8' }}>{b.apptCredits} appts</p>
                </div>

                <div className="text-right hidden sm:block">
                  <p className="text-[12px] font-semibold" style={{ color: '#64748b' }}>{b.leadsReceived}</p>
                  <p className="text-[10px]" style={{ color: '#94a3b8' }}>recebidos</p>
                </div>

                <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase flex-shrink-0"
                  style={{ background: TIER_BADGE[b.tier].bg, color: TIER_BADGE[b.tier].fg }}
                  title={b.tier === 'paying' ? 'Pagou de verdade (assinatura ou compra de créditos)' : b.tier === 'trial' ? 'Trial / cortesia — não pagou' : 'Free — sem plano nem pagamento'}>
                  {TIER_BADGE[b.tier].label}
                </span>

                <span className="text-[10px] font-bold uppercase flex items-center gap-1 flex-shrink-0" style={{ color: b.is_active ? '#15803d' : '#dc2626' }}>
                  <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: b.is_active ? '#22c55e' : '#ef4444' }} />
                  {b.is_active ? 'Ativo' : 'Inativo'}
                </span>

                {b.is_admin ? (
                  <span className="text-[16px] opacity-0 group-hover:opacity-100 flex-shrink-0" style={{ color: '#94a3b8' }}>›</span>
                ) : (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => handleDelete(e, b)}
                    title={`Apagar ${b.name}`}
                    className="text-[15px] w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 opacity-40 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all cursor-pointer"
                    style={{ color: '#94a3b8' }}>
                    {deleting === b.id ? '⏳' : '🗑'}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-[15px] font-semibold" style={{ color: '#1a1a2e' }}>Nenhum comprador encontrado</p>
            <p className="text-[13px] mt-1" style={{ color: '#94a3b8' }}>Ajuste os filtros</p>
          </div>
        )}
      </div>
    </div>
  )
}
