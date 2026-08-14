'use client'

import { useEffect, useState } from 'react'

interface Row { id: string; nome: string; email: string; comprou: number; recebeu: number; falta: number }
interface Data { total_devido: number; n_devendo: number; n_pagantes: number; compradores: Row[] }

export function BuyerDebtCard() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/buyer-debt')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="rounded-2xl overflow-hidden mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="px-6 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h2 className="text-[15px] font-bold" style={{ color: 'var(--fg)' }}>💳 Saldo Devedor — Compradores Pagos</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--fg-muted)' }}>Leads que cada comprador pagou e ainda NÃO recebeu</p>
        </div>
        {data && (
          <div className="text-right">
            <p className="text-[24px] font-extrabold leading-none" style={{ color: data.total_devido > 0 ? '#dc2626' : '#15803d' }}>{data.total_devido}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--fg-muted)' }}>leads devidos · {data.n_devendo} compradores</p>
          </div>
        )}
      </div>
      {loading ? (
        <div className="px-6 py-8 text-center text-[13px]" style={{ color: 'var(--fg-muted)' }}>Carregando…</div>
      ) : !data || data.compradores.length === 0 ? (
        <div className="px-6 py-8 text-center text-[13px]" style={{ color: 'var(--fg-muted)' }}>Nenhum comprador pagante.</div>
      ) : (
        <div>
          <div className="grid gap-2 px-6 py-2 text-[11px] font-bold uppercase tracking-wider" style={{ gridTemplateColumns: '1fr 70px 70px 70px', color: 'var(--fg-muted)', borderBottom: '1px solid var(--bg-soft)' }}>
            <span>Comprador</span>
            <span className="text-right">Comprou</span>
            <span className="text-right">Recebeu</span>
            <span className="text-right">Falta</span>
          </div>
          {data.compradores.map((c, i) => (
            <div key={c.id} className="grid gap-2 px-6 py-2.5 items-center"
              style={{ gridTemplateColumns: '1fr 70px 70px 70px', borderBottom: i < data.compradores.length - 1 ? '1px solid #f8fafc' : 'none' }}>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--fg)' }}>{c.nome}</p>
                <p className="text-[11px] truncate" style={{ color: '#cbd5e1' }}>{c.email}</p>
              </div>
              <span className="text-right text-[13px]" style={{ color: 'var(--fg-secondary)' }}>{c.comprou}</span>
              <span className="text-right text-[13px]" style={{ color: 'var(--fg-secondary)' }}>{c.recebeu}</span>
              <span className="text-right text-[15px] font-extrabold" style={{ color: c.falta > 0 ? '#dc2626' : '#15803d' }}>{c.falta > 0 ? c.falta : '✓'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
