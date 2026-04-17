'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  buyerId: string
  isActive: boolean
  crmPro: boolean
}

export function AdminActions({ buyerId, isActive, crmPro }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [showGrant, setShowGrant] = useState(false)
  const [grantType, setGrantType] = useState<'lead' | 'cold_lead' | 'appointment'>('lead')
  const [grantQty, setGrantQty] = useState(10)
  const [grantNote, setGrantNote] = useState('')

  async function call(action: string, body: any) {
    setLoading(action)
    await fetch(`/api/admin/buyers/${buyerId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setLoading(null)
    router.refresh()
  }

  async function grant() {
    if (grantQty < 1) return
    await call('grant-credits', { type: grantType, quantity: grantQty, note: grantNote || 'cortesia admin' })
    setShowGrant(false)
    setGrantQty(10)
    setGrantNote('')
  }

  return (
    <div className="rounded-2xl p-5 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
      <h2 className="text-[13px] font-bold uppercase tracking-wider mb-4" style={{ color: '#94a3b8' }}>Ações Admin</h2>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => call('toggle-crm', { active: !crmPro })} disabled={loading !== null}
          className="px-4 py-2 rounded-lg text-[12px] font-bold disabled:opacity-50"
          style={{
            background: crmPro ? '#fef2f2' : 'linear-gradient(135deg, #a78bfa, #6366f1)',
            color: crmPro ? '#dc2626' : '#fff',
          }}>
          {loading === 'toggle-crm' ? '...' : crmPro ? 'Desativar CRM Pro' : '⚡ Ativar CRM Pro'}
        </button>

        <button onClick={() => call('toggle-active', { active: !isActive })} disabled={loading !== null}
          className="px-4 py-2 rounded-lg text-[12px] font-bold disabled:opacity-50"
          style={{
            background: isActive ? '#fef3c7' : '#dcfce7',
            color: isActive ? '#92400e' : '#15803d',
          }}>
          {loading === 'toggle-active' ? '...' : isActive ? 'Suspender' : 'Reativar'}
        </button>

        <button onClick={() => setShowGrant(!showGrant)}
          className="px-4 py-2 rounded-lg text-[12px] font-bold"
          style={{ background: '#eef2ff', color: '#6366f1' }}>
          + Adicionar Créditos
        </button>
      </div>

      {showGrant && (
        <div className="rounded-xl p-4 mt-3" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: '#94a3b8' }}>Cortesia / Ajuste</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <select value={grantType} onChange={e => setGrantType(e.target.value as any)}
              className="px-3 py-2 rounded-lg text-[13px] font-semibold cursor-pointer"
              style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
              <option value="lead">Leads quentes</option>
              <option value="cold_lead">Leads frios</option>
              <option value="appointment">Appointments</option>
            </select>
            <input type="number" min="1" value={grantQty} onChange={e => setGrantQty(parseInt(e.target.value) || 0)} placeholder="Quantidade"
              className="px-3 py-2 rounded-lg text-[13px] font-semibold"
              style={{ background: '#fff', border: '1px solid #e8ecf4' }} />
            <input type="text" value={grantNote} onChange={e => setGrantNote(e.target.value)} placeholder="Motivo (opcional)"
              className="px-3 py-2 rounded-lg text-[13px]"
              style={{ background: '#fff', border: '1px solid #e8ecf4' }} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowGrant(false)} className="px-4 py-1.5 text-[12px] font-semibold" style={{ color: '#94a3b8' }}>Cancelar</button>
            <button onClick={grant} disabled={loading !== null}
              className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white disabled:opacity-50"
              style={{ background: '#6366f1' }}>
              {loading === 'grant-credits' ? 'Adicionando...' : `Adicionar ${grantQty} ${grantType}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
