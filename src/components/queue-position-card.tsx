'use client'

import { useEffect, useState } from 'react'

interface StateInfo { state: string; position: number; total: number; leadsPerDay: number; etaDays: number | null }
interface Data {
  credits: number; hasCredits: boolean; availableNow: boolean; nextWindowHint: string | null
  queueOrder: string; receivedToday: number; states: StateInfo[]; best: StateInfo | null; blockers: string[]
}

const ord = (n: number) => `${n}º`

function eta(d: StateInfo): string {
  if (d.position === 1) return d.leadsPerDay > 0 ? 'você é o próximo' : 'você é o próximo (sem volume agora)'
  if (d.etaDays === null) return 'sem previsão (estado sem leads no momento)'
  if (d.etaDays <= 1) return 'previsão: hoje'
  if (d.etaDays <= 2) return 'previsão: até amanhã'
  return `previsão: ~${Math.ceil(d.etaDays)} dias`
}

/**
 * Card "Sua vez na fila" (2026-07-30) — mostra ao comprador a posição REAL dele por
 * estado (mesma ordenação da distribuição), o volume do estado e uma estimativa. Também
 * avisa o que o está impedindo de receber agora (sem crédito / fora da janela / sem estado).
 * dark=true para o app mobile.
 */
export function QueuePositionCard({ dark = false }: { dark?: boolean }) {
  const [d, setD] = useState<Data | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => fetch('/api/queue-position', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(j => { if (alive) { setD(j); setErro(false) } })
      .catch(() => { if (alive) setErro(true) })
    load()
    const t = setInterval(load, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (erro || !d) return null
  if (!d.hasCredits) return null // sem crédito o card não faz sentido (a tela de compra cuida disso)

  const ink = dark ? 'var(--m-text, #fff)' : '#1a1a2e'
  const mut = dark ? 'var(--m-muted, #94a3b8)' : '#64748b'
  const card: React.CSSProperties = dark
    ? { background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.30)', borderRadius: 16, padding: 16, marginBottom: 14 }
    : { background: '#fff', border: '1px solid #e8ecf4', borderRadius: 16, padding: 18, marginBottom: 20 }

  const best = d.best
  const semFila = d.states.length === 0

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 17 }}>🎟️</span>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: ink }}>Sua vez na fila</p>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#6366f1' }}>
          {d.credits} {d.credits === 1 ? 'crédito' : 'créditos'}
        </span>
      </div>

      {semFila ? (
        <p style={{ margin: 0, fontSize: 12.5, color: mut }}>
          Ainda não consigo calcular sua posição — confirme seus estados licenciados em Configurações.
        </p>
      ) : (
        <>
          {best && (
            <p style={{ margin: '0 0 10px', fontSize: 13.5, fontWeight: 700, color: best.position === 1 ? '#059669' : ink }}>
              {best.position === 1
                ? `🥇 Você é o próximo a receber em ${best.state}`
                : `Você está em ${ord(best.position)} lugar na fila de ${best.state} (${best.total} na disputa)`}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {d.states.map(s => (
              <div key={s.state} style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
                padding: '7px 10px', borderRadius: 10,
                background: dark ? 'rgba(255,255,255,0.04)' : '#f8fafc',
              }}>
                <span style={{
                  fontWeight: 800, fontSize: 11, padding: '2px 7px', borderRadius: 6,
                  background: s.position === 1 ? (dark ? 'rgba(16,185,129,0.2)' : '#ecfdf5') : (dark ? 'rgba(99,102,241,0.18)' : '#eef2ff'),
                  color: s.position === 1 ? '#059669' : '#6366f1',
                }}>{s.state}</span>
                <span style={{ color: ink, fontWeight: 700 }}>{ord(s.position)} de {s.total}</span>
                <span style={{ color: mut }}>· {eta(s)}</span>
                <span style={{ marginLeft: 'auto', color: mut, fontSize: 11 }}>
                  {s.leadsPerDay > 0 ? `${s.leadsPerDay}/dia no estado` : 'sem leads (14d)'}
                </span>
              </div>
            ))}
          </div>

          {!d.availableNow && (
            <p style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 700, color: '#b45309' }}>
              ⏰ Fora do seu horário de recebimento agora — leads que chegarem vão para o próximo disponível.
              Ajuste em Configurações → Horários.
            </p>
          )}
          {d.receivedToday > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: mut }}>
              Você já recebeu {d.receivedToday} lead{d.receivedToday > 1 ? 's' : ''} hoje — quem ainda não recebeu tem prioridade na próxima rodada.
            </p>
          )}
          <p style={{ margin: '8px 0 0', fontSize: 11, color: mut }}>
            Estimativa pelo volume real dos últimos 14 dias. A ordem muda conforme quem recebe e os horários de cada um.
          </p>
        </>
      )}
    </div>
  )
}
