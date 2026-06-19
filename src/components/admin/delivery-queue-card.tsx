'use client'

import { useEffect, useState } from 'react'

interface Row { pos: number; id: string; nome: string; creditos: number; estados: string[] }

export function DeliveryQueueCard() {
  const [fila, setFila] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/delivery-queue')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { setFila(d?.fila || null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="rounded-2xl overflow-hidden mb-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
      <div className="px-6 py-4" style={{ borderBottom: '1px solid #e8ecf4' }}>
        <h2 className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>📦 Fila de Entregas</h2>
        <p className="text-[12px] mt-0.5" style={{ color: '#94a3b8' }}>Ordem em que recebem o próximo lead (mais crédito primeiro). O 1º apto no estado do lead leva.</p>
      </div>
      {loading ? (
        <div className="px-6 py-8 text-center text-[13px]" style={{ color: '#94a3b8' }}>Carregando…</div>
      ) : !fila || fila.length === 0 ? (
        <div className="px-6 py-8 text-center text-[13px]" style={{ color: '#94a3b8' }}>Ninguém na fila (nenhum comprador com crédito).</div>
      ) : (
        <div>
          {fila.map((q, i) => (
            <div key={q.id} className="flex items-center gap-4 px-6 py-3" style={{ borderBottom: i < fila.length - 1 ? '1px solid #f8fafc' : 'none' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[14px] font-extrabold flex-shrink-0"
                style={{ background: q.pos === 1 ? '#6366f1' : '#eef2ff', color: q.pos === 1 ? '#fff' : '#6366f1' }}>
                {q.pos}º
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold flex items-center gap-2" style={{ color: '#1a1a2e' }}>
                  <span className="truncate">{q.nome}</span>
                  {q.pos === 1 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0" style={{ background: '#eef2ff', color: '#6366f1' }}>próximo</span>}
                </p>
                <div className="flex gap-1 flex-wrap mt-1">
                  {q.estados.length === 0 ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#fef2f2', color: '#dc2626' }}>⚠️ sem estado — não recebe</span>
                  ) : (
                    <>
                      {q.estados.slice(0, 14).map(s => (
                        <span key={s} className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#f1f5f9', color: '#64748b' }}>{s}</span>
                      ))}
                      {q.estados.length > 14 && <span className="text-[10px] font-bold" style={{ color: '#94a3b8' }}>+{q.estados.length - 14}</span>}
                    </>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[18px] font-extrabold" style={{ color: '#15803d' }}>{q.creditos}</p>
                <p className="text-[10px]" style={{ color: '#94a3b8' }}>a receber</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
