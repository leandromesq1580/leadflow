'use client'

import { useEffect, useState, useRef } from 'react'
import type { AdminRuleBlock } from '@/lib/admin-rule'

interface Admin { id: string; nome: string; estados: string[]; regraAdmin: number | null; isFallback: boolean; receivedToday: number; dailyMax: number | null; blockedReason: AdminRuleBlock | null; isNext: boolean; isStaff?: boolean }
interface Row { pos: number; id: string; nome: string; creditos: number; estados: string[]; recebeuHoje?: boolean }
interface Data { adminRule: { N: number; leadsUntilAdmin: number | null; herTurnNow: boolean; ruleAvailable: boolean; isTurn: boolean }; queueOrder?: string; admins: Admin[]; fila: Row[] }

const BLOCK_LABELS: Record<AdminRuleBlock, string> = { disabled: 'Regra desligada', inactive: 'Conta inativa', no_license: 'Sem estado licenciado', daily_paused: 'Bloqueado: limite diário = 0', daily_limit: 'Limite diário atingido' }

const QUEUE_LABELS: Record<string, string> = { credito: 'Crédito', antiguidade: 'Antiguidade', hibrido: 'Híbrido', rodizio: 'Rodízio' }

function StateChips({ estados }: { estados: string[] }) {
  if (estados.length === 0) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--err-soft)', color: '#dc2626' }}>⚠️ sem estado — não recebe</span>
  if (estados.length >= 40) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)' }}>todos os {estados.length} estados</span>
  return <>{estados.slice(0, 14).map(s => <span key={s} className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)' }}>{s}</span>)}{estados.length > 14 && <span className="text-[10px] font-bold" style={{ color: 'var(--fg-muted)' }}>+{estados.length - 14}</span>}</>
}

export function DeliveryQueueCard() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState('')
  const [flash, setFlash] = useState(false)
  const sigRef = useRef('')
  const [savingOrder, setSavingOrder] = useState(false)

  async function changeOrder(order: string) {
    if (savingOrder || order === (data?.queueOrder || 'credito')) return
    setSavingOrder(true)
    try {
      await fetch('/api/admin/queue-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order }) })
      const d = await fetch('/api/admin/delivery-queue', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
      if (d) setData(d)
    } catch {}
    setSavingOrder(false)
  }

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const d = await fetch('/api/admin/delivery-queue', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
        if (!alive || !d) { if (alive) { setData(null); setLoading(false) }; return }
        const sig = JSON.stringify([d.adminRule, d.admins, (d.fila || []).map((q: Row) => q.id + ':' + q.creditos)])
        if (sigRef.current && sigRef.current !== sig) { setFlash(true); setTimeout(() => { if (alive) setFlash(false) }, 2500) }
        sigRef.current = sig
        setData(d); setUpdatedAt(new Date().toLocaleTimeString('pt-BR'))
      } catch { if (alive) setData(null) }
      if (alive) setLoading(false)
    }
    load()
    const t = setInterval(load, 15000)
    // Re-busca quando a aba volta ao foco: o navegador congela timers de abas em
    // segundo plano (por isso o "ao vivo" travava em 15:39). Ao reabrir, atualiza na hora.
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [])

  const ar = data?.adminRule
  const adminNome = data?.admins.filter(a => a.isNext).map(a => a.nome).join(' / ') || 'Prioridade'
  const proximoTxt = ar
    ? (ar.herTurnNow
      ? `👑 ${adminNome} — 1 a cada ${ar.N}, conforme o estado do lead`
      : `1º apto da fila no estado do lead${ar.N > 0 && !ar.ruleAvailable ? ' · prioridade bloqueada (veja o motivo abaixo)' : ar.N > 0 && ar.isTurn ? ' · prioridade sem destinatário apto nesta vez' : ar.N > 0 && ar.leadsUntilAdmin ? ` · vez da prioridade em ${ar.leadsUntilAdmin} leads, conforme estado e limite diário` : ''}`)
    : ''

  return (
    <div className="rounded-2xl overflow-hidden mb-6" style={{ background: 'var(--bg-card)', border: flash ? '2px solid var(--accent)' : '1px solid var(--border)', transition: 'border-color .4s' }}>
      <div className="px-6 py-4 flex items-start justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h2 className="text-[15px] font-bold flex items-center gap-2" style={{ color: 'var(--fg)' }}>📦 Fila de Entregas {flash && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>↑ atualizada</span>}</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--fg-muted)' }}>Ordem real: o admin intercepta pela regra; o resto, por <b>{(QUEUE_LABELS[data?.queueOrder || 'credito'] || 'Crédito').toLowerCase()}</b>.</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: data ? '#22c55e' : '#f59e0b' }} />
          <span className="text-[11px] font-semibold" style={{ color: data ? '#15803d' : '#b45309' }}>{data ? 'ao vivo' : 'sem atualização'}</span>
          {updatedAt && <span className="text-[10px]" style={{ color: '#cbd5e1' }}>· {updatedAt}</span>}
        </div>
      </div>

      <div className="px-6 py-2.5 flex items-center gap-2 flex-wrap" style={{ borderBottom: '1px solid var(--bg-soft)', background: '#fcfcff' }}>
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>Regra da fila:</span>
        {(['credito', 'antiguidade', 'hibrido', 'rodizio'] as const).map(o => {
          const active = (data?.queueOrder || 'credito') === o
          return <button key={o} onClick={() => changeOrder(o)} disabled={savingOrder} className="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all disabled:opacity-50" style={active ? { background: 'var(--accent)', color: 'var(--bg-card)' } : { background: 'var(--accent-light)', color: 'var(--accent)' }}>{QUEUE_LABELS[o]}</button>
        })}
        {savingOrder && <span className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>salvando…</span>}
      </div>

      {loading ? <div className="px-6 py-8 text-center text-[13px]" style={{ color: 'var(--fg-muted)' }}>Carregando…</div> : !data ? <div className="px-6 py-8 text-center text-[13px]" style={{ color: 'var(--fg-muted)' }}>Erro ao carregar.</div> : (
        <div>
          <div className="px-6 py-3" style={{ background: '#f8f9ff', borderBottom: '1px solid #eef2ff' }}>
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>🎯 Previsão do próximo lead</p>
            <p className="text-[13px] font-semibold mt-0.5" style={{ color: 'var(--fg)' }}>{proximoTxt}</p>
          </div>

          {data.admins.map(a => (
            <div key={a.id} className="flex items-center gap-4 px-6 py-3" style={{ borderBottom: '1px solid #f8fafc', background: a.isNext ? '#f5f3ff' : 'var(--bg-card)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[15px] flex-shrink-0" style={{ background: '#3b1d7a' }}>👑</div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold flex items-center gap-2 flex-wrap" style={{ color: 'var(--fg)' }}>
                  <span className="truncate">{a.nome}</span>
                  {a.isStaff && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#eef2ff', color: '#4338ca' }}>Funcionário · sem débito de crédito</span>}
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: '#ede9fe', color: '#6d28d9' }}>{a.regraAdmin ? 'prioridade' : 'reserva'}</span>
                  {a.regraAdmin ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#ede9fe', color: '#6d28d9' }}>1 a cada {a.regraAdmin}</span> : null}
                  {a.isFallback ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-soft)', color: 'var(--fg-secondary)' }}>fallback</span> : null}
                </p>
                <div className="flex gap-1 flex-wrap mt-1"><StateChips estados={a.estados} /></div>
                {!!a.regraAdmin && <p className="text-[10px] mt-1" style={{ color: 'var(--fg-muted)' }}>{a.receivedToday} recebidos hoje · {a.dailyMax == null ? 'sem limite diário' : `limite diário: ${a.dailyMax}`}</p>}
                {a.blockedReason && <p className="text-[11px] font-bold mt-1" style={{ color: '#dc2626' }}>⚠️ {BLOCK_LABELS[a.blockedReason]}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                {a.regraAdmin ? (
                  <>
                    <p className="text-[13px] font-extrabold" style={{ color: a.blockedReason ? '#dc2626' : a.isNext ? '#6d28d9' : 'var(--fg-muted)' }}>{a.blockedReason ? 'BLOQUEADO' : a.isNext ? 'PRÓXIMO' : 'AGUARDANDO'}</p>
                    <p className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>{a.blockedReason ? 'não recebe pela prioridade' : a.isNext ? 'se licenciado no estado' : 'conforme rodízio e estado'}</p>
                  </>
                ) : <p className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>só fallback</p>}
              </div>
            </div>
          ))}

          <div className="px-6 py-2" style={{ background: '#fafbff' }}><p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>Fila por {(QUEUE_LABELS[data?.queueOrder || 'credito'] || 'Crédito').toLowerCase()} — recebem os outros leads</p></div>

          {data.fila.length === 0 ? <div className="px-6 py-4 text-center text-[12px]" style={{ color: 'var(--fg-muted)' }}>Ninguém com crédito.</div> : data.fila.map((q, i) => (
            <div key={q.id} className="flex items-center gap-4 px-6 py-3" style={{ borderBottom: i < data.fila.length - 1 ? '1px solid #f8fafc' : 'none' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[14px] font-extrabold flex-shrink-0" style={{ background: q.pos === 1 ? 'var(--accent)' : 'var(--accent-light)', color: q.pos === 1 ? 'var(--bg-card)' : 'var(--accent)' }}>{q.pos}º</div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold flex items-center gap-2" style={{ color: 'var(--fg)' }}><span className="truncate">{q.nome}</span>{q.pos === 1 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>1º da fila</span>}{q.recebeuHoje ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--bg-soft)', color: 'var(--fg-muted)' }}>✓ recebeu hoje</span> : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--ok-line)', color: '#15803d' }}>🟢 aguarda 1º do dia</span>}</p>
                <div className="flex gap-1 flex-wrap mt-1"><StateChips estados={q.estados} /></div>
              </div>
              <div className="text-right flex-shrink-0"><p className="text-[18px] font-extrabold" style={{ color: '#15803d' }}>{q.creditos}</p><p className="text-[10px]" style={{ color: 'var(--fg-muted)' }}>a receber</p></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
