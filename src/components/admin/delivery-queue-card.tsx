'use client'

import { useEffect, useState, useRef } from 'react'

interface Row { pos: number; id: string; nome: string; creditos: number; estados: string[] }

export function DeliveryQueueCard() {
  const [fila, setFila] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState('')
  const [flash, setFlash] = useState(false)
  const sigRef = useRef('')

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const d = await fetch('/api/admin/delivery-queue').then(r => (r.ok ? r.json() : null))
        if (!alive || !d?.fila) { if (alive) setLoading(false); return }
        const sig = d.fila.map((q: Row) => `${q.id}:${q.creditos}`).join('|')
        if (sigRef.current && sigRef.current !== sig) {
          setFlash(true)
          setTimeout(() => { if (alive) setFlash(false) }, 2500)
        }
        sigRef.current = sig
        setFila(d.fila)
        setUpdatedAt(new Date().toLocaleTimeString('pt-BR'))
      } catch {}
      if (alive) setLoading(false)
    }
    load()
    const t = setInterval(load, 15000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  return (
    <div className="rounded-2xl overflow-hidden mb-6" style={{ background: '#fff', border: flash ? '2px solid #6366f1' : '1px solid #e8ecf4', transition: 'border-color .4s' }}>
      <div className="px-6 py-4 flex items-start justify-between" style={{ borderBottom: '1px solid #e8ecf4' }}>
        <div>
          <h2 className="text-[15px] font-bold flex items-center gap-2" style={{ color: '#1a1a2e' }}>
            📦 Fila de Entregas
            {flash && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: '#eef2ff', color: '#6366f1' }}>↑ atualizada</span>}
          </h2>
          <p className="text-[12px] mt-0.5" style={{ color: '#94a3b8' }}>Ordem em que recebem o próximo lead (mais crédito primeiro). O 1º apto no estado do lead leva.</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: '#22c55e' }} />
          <span className="text-[11px] font-semibold" style={{ color: '#15803d' }}>ao vivo</span>
          {updatedAt && <span className="text-[10px]" style={{ color: '#cbd5e1' }}>· {updatedAt}</span>}
        </div>
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
