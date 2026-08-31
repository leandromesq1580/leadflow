'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n-client'
import { leadLanguageLabel, type LeadLanguage } from '@/lib/lead-language'

interface StateInfo { state: string; position: number; total: number; leadsPerDay: number; etaDays: number | null }
interface Data {
  credits: number; hasCredits: boolean; availableNow: boolean; nextWindowHint: string | null
  queueOrder: string; receivedToday: number; states: StateInfo[]; best: StateInfo | null; blockers: string[]
  isStaff?: boolean
}

type LFn = (pt: string, en: string, es: string) => string

const ord = (n: number, locale: string) => {
  if (locale === 'en') {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
  }
  return `${n}º`
}

function eta(d: StateInfo, L: LFn): string {
  if (d.position === 1) {
    // 1º lugar em estado de volume baixo não promete rapidez — evita frustração
    if (d.etaDays !== null && d.etaDays > 2) {
      const dias = Math.ceil(d.etaDays)
      return L(`você é o próximo (chega ~${dias} dias)`, `you're next (arrives in ~${dias} days)`, `eres el próximo (llega en ~${dias} días)`)
    }
    return L('você é o próximo', "you're next", 'eres el próximo')
  }
  if (d.etaDays === null) return L('sem previsão', 'no estimate', 'sin estimado')
  if (d.etaDays <= 1) return L('previsão: hoje', 'estimate: today', 'estimado: hoy')
  if (d.etaDays <= 2) return L('previsão: até amanhã', 'estimate: by tomorrow', 'estimado: para mañana')
  return L(`previsão: ~${Math.ceil(d.etaDays)} dias`, `estimate: ~${Math.ceil(d.etaDays)} days`, `estimado: ~${Math.ceil(d.etaDays)} días`)
}

/**
 * Card "Sua vez na fila" (2026-07-30) — mostra ao comprador a posição REAL dele por
 * estado (mesma ordenação da distribuição), o volume do estado e uma estimativa. Também
 * avisa o que o está impedindo de receber agora (sem crédito / fora da janela / sem estado).
 * dark=true para o app mobile.
 */
export function QueuePositionCard({ dark = false }: { dark?: boolean }) {
  return <><LanguageQueuePositionCard dark={dark} language="pt" /><LanguageQueuePositionCard dark={dark} language="es" /></>
}

function LanguageQueuePositionCard({ dark, language }: { dark: boolean; language: LeadLanguage }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [d, setD] = useState<Data | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => fetch(`/api/queue-position?language=${language}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(j => { if (alive) { setD(j); setErro(false) } })
      .catch(() => { if (alive) setErro(true) })
    load()
    const t = setInterval(load, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [language])

  if (erro || !d) return null
  if (d.isStaff) return <div className="rounded-xl p-4 mb-4 text-sm" style={{ background: dark ? 'rgba(124,58,237,0.10)' : 'var(--bg-card)', color: dark ? 'var(--m-text, #fff)' : 'var(--fg)' }}>
    {L('Conta de funcionário: fora da fila de clientes. Leads somente por prioridade definida pelo administrador.', 'Staff account: excluded from the customer queue. Leads are assigned only through explicit administrator priority.', 'Cuenta de empleado: fuera de la cola de clientes. Los leads se asignan solo por prioridad explícita del administrador.')}
  </div>
  if (!d.hasCredits) return null // sem crédito o card não faz sentido (a tela de compra cuida disso)

  const ink = dark ? 'var(--m-text, #fff)' : '#1a1a2e'
  const mut = dark ? 'var(--m-muted, #94a3b8)' : '#64748b'
  const card: React.CSSProperties = dark
    ? { background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.30)', borderRadius: 16, padding: 16, marginBottom: 14 }
    : { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }

  const best = d.best
  const semFila = d.states.length === 0
  // Enxuga a lista (2026-07-30): estado SEM lead nos últimos 14 dias é ruído — sai da
  // lista e vira um resumo discreto. Mostra os 5 mais relevantes (menor previsão).
  const ativos = d.states.filter(s => s.leadsPerDay > 0)
  const semVolume = d.states.filter(s => s.leadsPerDay === 0).map(s => s.state)
  const visiveis = ativos.slice(0, 5)
  const extras = ativos.length - visiveis.length

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 17 }}>🎟️</span>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: ink }}>{L('Sua vez na fila', 'Your place in line', 'Tu turno en la fila')} · {leadLanguageLabel(language, t._locale)}</p>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
          {d.credits} {d.credits === 1 ? L('crédito', 'credit', 'crédito') : L('créditos', 'credits', 'créditos')}
        </span>
      </div>

      {semFila ? (
        <p style={{ margin: 0, fontSize: 12.5, color: mut }}>
          {L('Ainda não consigo calcular sua posição — confirme seus estados licenciados em Configurações.',
            "We can't calculate your position yet — confirm your licensed states in Settings.",
            'Aún no podemos calcular tu posición — confirma tus estados con licencia en Configuración.')}
        </p>
      ) : (
        <>
          {best && (
            <p style={{ margin: '0 0 10px', fontSize: 13.5, fontWeight: 700, color: best.position === 1 && (best.etaDays ?? 99) <= 2 ? '#059669' : ink }}>
              {best.position === 1
                ? L(`🥇 Você é o próximo a receber em ${best.state}`,
                    `🥇 You're next to receive in ${best.state}`,
                    `🥇 Eres el próximo en recibir en ${best.state}`)
                : L(`Você está em ${ord(best.position, t._locale)} lugar na fila de ${best.state} (${best.total} na disputa)`,
                    `You're ${ord(best.position, t._locale)} in line for ${best.state} (${best.total} competing)`,
                    `Estás en ${ord(best.position, t._locale)} lugar en la fila de ${best.state} (${best.total} en la disputa)`)}
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 7, fontSize: 10.5, color: mut }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#10b981', display: 'inline-block' }} />
              {L('SUA VEZ = próximo lead do estado é seu', "YOUR TURN = the state's next lead is yours", 'TU TURNO = el próximo lead del estado es tuyo')}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(139,92,246,0.35)', display: 'inline-block' }} />
              {L('Nº na fila = há gente na sua frente', 'No. in line = others are ahead of you', 'Nº en la fila = hay gente delante de ti')}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visiveis.map(s => {
              const primeiro = s.position === 1
              return (
                <div key={s.state} style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
                  padding: '7px 10px', borderRadius: 10,
                  background: dark ? 'rgba(255,255,255,0.04)' : 'var(--bg-soft)',
                  borderLeft: `3px solid ${primeiro ? '#10b981' : 'rgba(139,92,246,0.35)'}`,
                }}>
                  <span style={{
                    fontWeight: 800, fontSize: 11, padding: '2px 7px', borderRadius: 6,
                    background: dark ? 'rgba(255,255,255,0.08)' : 'var(--accent-light)', color: dark ? 'var(--m-text)' : '#6d28d9',
                  }}>{s.state}</span>
                  {/* Texto explícito — não depender da cor pra entender a posição */}
                  <span style={{ fontWeight: 800, fontSize: 11, color: primeiro ? '#059669' : 'var(--accent)' }}>
                    {primeiro
                      ? L('SUA VEZ', 'YOUR TURN', 'TU TURNO')
                      : L(`${ord(s.position, t._locale)} na fila`, `${ord(s.position, t._locale)} in line`, `${ord(s.position, t._locale)} en la fila`)}
                  </span>
                  <span style={{ color: mut }}>
                    {primeiro
                      ? L(`de ${s.total} · ${eta(s, L)}`, `of ${s.total} · ${eta(s, L)}`, `de ${s.total} · ${eta(s, L)}`)
                      : L(`de ${s.total} · ${eta(s, L)}`, `of ${s.total} · ${eta(s, L)}`, `de ${s.total} · ${eta(s, L)}`)}
                  </span>
                  <span style={{ marginLeft: 'auto', color: mut, fontSize: 11 }}>
                    {s.leadsPerDay > 0
                      ? L(`${s.leadsPerDay}/dia no estado`, `${s.leadsPerDay}/day in this state`, `${s.leadsPerDay}/día en el estado`)
                      : L('sem leads (14d)', 'no leads (14d)', 'sin leads (14d)')}
                  </span>
                </div>
              )
            })}
          </div>

          {!d.availableNow && (
            <p style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 700, color: '#b45309' }}>
              {L('⏰ Fora do seu horário de recebimento agora — leads que chegarem vão para o próximo disponível. Ajuste em Configurações → Horários.',
                '⏰ Outside your receiving hours right now — incoming leads go to the next available buyer. Adjust in Settings → Hours.',
                '⏰ Fuera de tu horario de recepción ahora — los leads que lleguen irán al próximo disponible. Ajústalo en Configuración → Horarios.')}
            </p>
          )}
          {d.receivedToday > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: mut }}>
              {L(`Você já recebeu ${d.receivedToday} lead${d.receivedToday > 1 ? 's' : ''} hoje — quem ainda não recebeu tem prioridade na próxima rodada.`,
                `You've already received ${d.receivedToday} lead${d.receivedToday > 1 ? 's' : ''} today — buyers who haven't received yet get priority in the next round.`,
                `Ya recibiste ${d.receivedToday} lead${d.receivedToday > 1 ? 's' : ''} hoy — quien aún no ha recibido tiene prioridad en la próxima ronda.`)}
            </p>
          )}
          {(extras > 0 || semVolume.length > 0) && (
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: mut }}>
              {extras > 0 && `+${extras} ${extras === 1
                ? L('outro estado com movimento', 'other state with activity', 'otro estado con movimiento')
                : L('outros estados com movimento', 'other states with activity', 'otros estados con movimiento')}. `}
              {semVolume.length > 0 && L(`Sem leads nos últimos 14 dias: ${semVolume.join(', ')}.`,
                `No leads in the last 14 days: ${semVolume.join(', ')}.`,
                `Sin leads en los últimos 14 días: ${semVolume.join(', ')}.`)}
            </p>
          )}
          <p style={{ margin: '8px 0 0', fontSize: 11, color: mut }}>
            {L('Estimativa pelo volume real dos últimos 14 dias. A ordem muda conforme quem recebe e os horários de cada um.',
              "Estimate based on actual volume from the last 14 days. The order shifts as leads are delivered and by each buyer's hours.",
              'Estimado según el volumen real de los últimos 14 días. El orden cambia según quién recibe y los horarios de cada uno.')}
          </p>
        </>
      )}
    </div>
  )
}
