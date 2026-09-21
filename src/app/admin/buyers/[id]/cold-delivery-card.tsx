'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ColdPurchaseStatus } from '@/lib/cold-leads'

type Stock = { pt: number; es: number }
type Result = { delivered: number; remaining: number; stock_after: number; notified: { email: boolean; whatsapp: boolean } }

/**
 * ❄️ Entrega de leads frios pelo admin — só aparece se o comprador tem compra de frio.
 * Cada entrega vira lead_delivery_receipts (append-only) + aviso ao cliente. Sem planilha sem rastro.
 */
export function ColdDeliveryCard({ buyerId, purchases: initial, stock: initialStock }: { buyerId: string; purchases: ColdPurchaseStatus[]; stock: Stock }) {
  const router = useRouter()
  const [purchases, setPurchases] = useState(initial)
  const [stock, setStock] = useState(initialStock)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  if (!purchases.length) return null

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/New_York' })
  const lang = (l: string | null) => (l === 'es' ? 'ES' : l === 'pt' ? 'BR' : '?')

  async function deliver(p: ColdPurchaseStatus) {
    const available = p.lead_language ? stock[p.lead_language] : 0
    const qty = Math.min(p.remaining, available)
    if (qty <= 0) return
    if (!confirm(`Entregar ${qty} leads frios (${lang(p.lead_language)}) agora?\n\nOs leads saem do estoque, aparecem em "Meus Leads" do cliente, geram recibo e ele recebe e-mail/WhatsApp.`)) return
    setBusy(p.payment_id); setMsg(null)
    try {
      const r = await fetch(`/api/admin/buyers/${buyerId}/deliver-cold`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_id: p.payment_id, quantity: qty }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha ao entregar.')
      const res: Result = d.result
      setPurchases(d.purchases); setStock(d.stock)
      setMsg({ kind: 'ok', text: `${res.delivered} leads entregues e registrados com recibo. Aviso ao cliente: e-mail ${res.notified.email ? 'enviado' : 'falhou'}, WhatsApp ${res.notified.whatsapp ? 'enviado' : 'falhou/sem número'}. Restam ${res.remaining} desta compra; estoque agora ${res.stock_after}.` })
      router.refresh()
    } catch (e) { setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Falha ao entregar.' }) }
    setBusy(null)
  }

  return (
    <div className="rounded-2xl p-5 mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>❄️ Leads frios comprados</h2>
          <p className="text-[12px]" style={{ color: '#94a3b8' }}>Entrega feita aqui gera recibo (prova de entrega) e avisa o cliente. Estoque agora: BR {stock.pt} · ES {stock.es}</p>
        </div>
      </div>
      {msg && <div className={`px-4 py-2.5 rounded-xl mb-3 text-[13px] font-medium border ${msg.kind === 'ok' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>{msg.kind === 'ok' ? '✅ ' : '⚠️ '}{msg.text}</div>}
      <div className="space-y-2">
        {purchases.map(p => {
          const available = p.lead_language ? stock[p.lead_language] : 0
          const canDeliver = Math.min(p.remaining, available)
          return (
            <div key={p.payment_id} className="flex items-center justify-between gap-3 flex-wrap rounded-xl px-4 py-3" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
              <div className="text-[13px]">
                <p className="font-bold" style={{ color: '#1a1a2e' }}>{fmt(p.created_at)} · {p.quantity} leads frios {lang(p.lead_language)} · ${p.amount}</p>
                <p style={{ color: p.remaining > 0 ? '#b45309' : '#059669' }}>
                  {p.delivered} entregues / {p.quantity} · {p.remaining > 0 ? <b>faltam {p.remaining}</b> : <b>compra completa</b>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {p.delivered > 0 && (
                  <a href={`/api/admin/buyers/${buyerId}/deliver-cold?payment_id=${p.payment_id}&format=csv`} className="px-3 py-2 rounded-xl text-[12px] font-bold" style={{ background: '#eef2ff', color: '#4338ca' }}>⬇ Planilha dos entregues</a>
                )}
                {p.remaining > 0 && (
                  <button type="button" onClick={() => deliver(p)} disabled={busy === p.payment_id || canDeliver <= 0}
                    className="px-4 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-40" style={{ background: '#334155' }}
                    title={canDeliver <= 0 ? `Sem estoque ${lang(p.lead_language)} no momento` : ''}>
                    {busy === p.payment_id ? 'Entregando…' : canDeliver <= 0 ? `Sem estoque ${lang(p.lead_language)}` : `Entregar ${canDeliver}`}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
