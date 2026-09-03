'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type SalesTeamPricing, validTeamPrice } from '@/lib/sales-team-pricing'

export function SalesTeamCard({ buyerId, initial }: { buyerId: string; initial: SalesTeamPricing }) {
  const [saved, setSaved] = useState(initial)
  const [price, setPrice] = useState((initial.lead_unit_price_cents / 100).toFixed(2))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [retryMembership, setRetryMembership] = useState(initial.is_member)
  const router = useRouter()

  async function save(isMember: boolean) {
    if (busy) return
    setRetryMembership(isMember)
    const raw = price.trim().replace(',', '.')
    const cents = Math.round(Number(raw) * 100)
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || !validTeamPrice(cents)) {
      setError('Use um preço entre US$0,50 e US$1.000,00, com até duas casas decimais.'); return
    }
    if (saved.is_member === isMember && saved.lead_unit_price_cents === cents) return
    setBusy(true); setError(''); setMessage('')
    try {
      const r = await fetch(`/api/admin/buyers/${buyerId}/sales-team`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_member: isMember, lead_unit_price_cents: cents }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'Falha ao salvar. Tente novamente.'); return }
      setSaved(d); setPrice((d.lead_unit_price_cents / 100).toFixed(2)); setMessage('Salvo automaticamente.'); router.refresh()
    } catch { setError('Falha de conexão. A alteração não foi confirmada. Tente novamente.') }
    finally { setBusy(false) }
  }

  return <section className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
    <h2 className="text-[15px] font-bold mb-3" style={{ color: '#1a1a2e' }}>Equipe de vendas · preço de leads</h2>
    <label className="flex items-center gap-3 text-[14px] font-semibold cursor-pointer">
      <input type="checkbox" checked={saved.is_member} disabled={busy}
        onChange={e => save(e.target.checked)} className="w-5 h-5 accent-indigo-600" />
      Faz parte da nossa equipe de vendas
    </label>
    <label className="block text-[12px] font-semibold mt-4">
      Preço por lead exclusivo (US$)
      <input aria-label="Preço da equipe por lead" inputMode="decimal" value={price} disabled={busy}
        onChange={e => { setPrice(e.target.value); setError(''); setMessage('') }}
        onBlur={() => save(saved.is_member)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className="block mt-1 w-36 px-3 py-2 rounded-lg border border-slate-200 text-[15px]" />
    </label>
    <p className="text-[12px] mt-3 text-slate-500">{saved.is_member
      ? `Benefício ativo: US$${(saved.lead_unit_price_cents / 100).toFixed(2)} por lead exclusivo, aplicado automaticamente nas novas compras.`
      : 'Benefício desativado: esta pessoa compra pelos preços normais. O preço acima só vale quando a marcação estiver ativa.'}</p>
    <p className="text-[12px] mt-2 text-slate-500">Não muda a fila, os créditos, o acesso Admin ou a condição de funcionário. CRM e leads frios mantêm seus preços. Cupons não acumulam: vale o menor preço entre equipe e cupom válido.</p>
    <p role="status" className="text-[12px] mt-2 text-emerald-700">{busy ? 'Salvando...' : message}</p>
    {error && <div role="alert" className="mt-2 text-[12px] text-red-600">{error} <button className="underline" onClick={() => save(retryMembership)}>Tentar novamente</button></div>}
  </section>
}
