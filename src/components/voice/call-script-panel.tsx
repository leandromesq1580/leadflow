'use client'

import { useEffect, useRef, useState } from 'react'
import { aplicarNome, type CallScript } from '@/lib/call-script'
import { useT } from '@/lib/i18n-client'

interface Assist { etapa_num: number; sugestao: string; motivo?: string; em: string }

/**
 * PAINEL DE ROTEIRO — aparece ao lado do softphone DURANTE a ligação (Fase 1).
 *
 * Mostra o script de vendas por etapas: objetivo, falas prontas (com o nome do lead
 * no lugar de {{nome}}), momentos de escuta e o gatilho pra avançar. Navegação é
 * MANUAL (Fase 2 é a detecção automática por transcrição ao vivo).
 *
 * Só aparece pra quem ATIVOU o roteiro (opt-in, desligado por padrão) e some
 * sozinho quando a ligação termina. Nova ligação recomeça da etapa 1.
 */
export function CallScriptPanel({ ativa, leadName, callSid }: { ativa: boolean; leadName?: string; callSid?: string }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [cfg, setCfg] = useState<{ enabled: boolean; script: CallScript } | null>(null)
  const [etapa, setEtapa] = useState(0)
  const [mini, setMini] = useState(false)
  const [assist, setAssist] = useState<Assist | null>(null)
  const [ouvindo, setOuvindo] = useState(false)
  const idxRef = useRef(0)
  // navegação manual trava o salto automático por 20s — quem manda é o corretor
  const manualAte = useRef(0)
  const irManual = (i: number) => { manualAte.current = Date.now() + 20000; setEtapa(i) }

  useEffect(() => {
    fetch('/api/call-script', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setCfg(d) }).catch(() => {})
  }, [])

  // nova ligação = recomeça do zero
  useEffect(() => { if (ativa) { setEtapa(0); idxRef.current = 0; setMini(false); setAssist(null); manualAte.current = 0 } }, [ativa])

  // FASE 2: com a chamada identificada, consulta a sugestão da IA a cada 3,5s.
  // A IA move a etapa sozinha; clique manual trava o salto por 20s.
  useEffect(() => {
    if (!ativa || !callSid) return
    let vivo = true
    const tick = async () => {
      try {
        const d = await fetch(`/api/call-assist?call=${callSid}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
        if (!vivo || !d) return
        setOuvindo(!!d.ouvindo)
        if (d.assist?.sugestao) {
          setAssist(d.assist)
          if (Date.now() > manualAte.current) setEtapa(Math.max(0, (d.assist.etapa_num || 1) - 1))
        }
      } catch {}
    }
    tick()
    const iv = setInterval(tick, 3500)
    return () => { vivo = false; clearInterval(iv) }
  }, [ativa, callSid])

  if (!ativa || !cfg?.enabled) return null
  const etapas = cfg.script.etapas
  const e = etapas[Math.min(etapa, etapas.length - 1)]
  const nome = leadName

  if (mini) {
    return (
      <button onClick={() => setMini(false)} style={{
        position: 'fixed', bottom: 20, right: 336, zIndex: 9999, padding: '10px 14px',
        background: '#0f172a', color: '#fff', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)',
        fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
      }}>
        📜 {L('Roteiro', 'Script', 'Guion')} · {L('etapa', 'step', 'etapa')} {etapa + 1}/{etapas.length}
      </button>
    )
  }

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 336, zIndex: 9999, width: 390, maxHeight: '72vh',
      display: 'flex', flexDirection: 'column',
      background: '#0f172a', color: '#fff', borderRadius: 16,
      boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* cabeçalho */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>📜</span>
          <p style={{ margin: 0, flex: 1, fontSize: 13, fontWeight: 800 }}>
            {cfg.script.nome} · <span style={{ color: '#a5b4fc' }}>{L('etapa', 'step', 'etapa')} {etapa + 1} {L('de', 'of', 'de')} {etapas.length}</span>
            {ouvindo && <span title={L('IA ouvindo a ligação', 'AI listening to the call', 'IA escuchando la llamada')} style={{ marginLeft: 6, fontSize: 10, color: '#34d399', fontWeight: 700 }}>● {L('ouvindo', 'listening', 'escuchando')}</span>}
          </p>
          <button onClick={() => setMini(true)} title={L('Minimizar', 'Minimize', 'Minimizar')}
            style={{ background: 'none', border: 'none', color: 'var(--fg-secondary)', cursor: 'pointer', fontSize: 14, padding: 2 }}>—</button>
        </div>
        {/* trilha de etapas clicável */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
          {etapas.map((x, i) => (
            <button key={x.id} onClick={() => irManual(i)} title={`${i + 1}. ${x.titulo}`}
              style={{
                flex: 1, height: 5, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 0,
                background: i < etapa ? '#34d399' : i === etapa ? '#818cf8' : 'rgba(255,255,255,0.14)',
              }} />
          ))}
        </div>
      </div>

      {/* etapa atual */}
      <div style={{ padding: '12px 14px', overflowY: 'auto', flex: 1 }}>
        {assist?.sugestao && (
          <div style={{ marginBottom: 12, borderRadius: 12, padding: '10px 12px', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.45)' }}>
            <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, color: '#34d399', letterSpacing: 0.5 }}>💡 {L('IA SUGERE AGORA', 'AI SUGGESTS NOW', 'LA IA SUGIERE AHORA')}</p>
            <p style={{ margin: '5px 0 0', fontSize: 13.5, lineHeight: 1.45, color: '#ecfdf5', fontWeight: 600 }}>{assist.sugestao}</p>
            {assist.motivo && <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#6ee7b7' }}>{assist.motivo}</p>}
          </div>
        )}
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{etapa + 1}. {e.titulo}</p>
        {e.objetivo && (
          <p style={{ margin: '3px 0 10px', fontSize: 11.5, color: '#818cf8', fontWeight: 700 }}>🎯 {e.objetivo}</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {e.falas.map((f, i) => (
            <p key={i} style={{
              margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--bg-soft)',
              background: 'rgba(255,255,255,0.05)', borderLeft: '3px solid #6366f1',
              borderRadius: '0 8px 8px 0', padding: '7px 10px',
            }}>{aplicarNome(f, nome)}</p>
          ))}
        </div>
        {!!e.escutas?.length && (
          <div style={{ marginTop: 10, background: 'rgba(245,158,11,0.1)', border: '1px dashed rgba(245,158,11,0.4)', borderRadius: 10, padding: '8px 10px' }}>
            {e.escutas.map((x, i) => (
              <p key={i} style={{ margin: i ? '4px 0 0' : 0, fontSize: 11.5, color: '#fbbf24' }}>👂 {x}</p>
            ))}
          </div>
        )}
      </div>

      {/* avanço */}
      <div style={{ padding: '10px 14px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {e.gatilho && (
          <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--fg-muted)' }}>✅ {L('Avance quando:', 'Move on when:', 'Avanza cuando:')} <b style={{ color: '#cbd5e1' }}>{e.gatilho}</b></p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => irManual(Math.max(0, etapa - 1))} disabled={etapa === 0}
            style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--bg-card)', fontSize: 12, fontWeight: 700, cursor: etapa === 0 ? 'default' : 'pointer', opacity: etapa === 0 ? 0.4 : 1 }}>
            ← {L('Voltar', 'Back', 'Volver')}
          </button>
          <button onClick={() => irManual(Math.min(etapas.length - 1, etapa + 1))} disabled={etapa >= etapas.length - 1}
            style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: 'none', background: etapa >= etapas.length - 1 ? 'rgba(52,211,153,0.25)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'var(--bg-card)', fontSize: 12.5, fontWeight: 800, cursor: etapa >= etapas.length - 1 ? 'default' : 'pointer' }}>
            {etapa >= etapas.length - 1 ? L('🏁 Última etapa — feche a venda', '🏁 Last step — close the sale', '🏁 Última etapa — cierra la venta') : L('Próxima etapa →', 'Next step →', 'Siguiente etapa →')}
          </button>
        </div>
      </div>
    </div>
  )
}
