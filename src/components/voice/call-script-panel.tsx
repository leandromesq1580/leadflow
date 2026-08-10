'use client'

import { useEffect, useRef, useState } from 'react'
import { aplicarNome, type CallScript } from '@/lib/call-script'

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
export function CallScriptPanel({ ativa, leadName }: { ativa: boolean; leadName?: string }) {
  const [cfg, setCfg] = useState<{ enabled: boolean; script: CallScript } | null>(null)
  const [etapa, setEtapa] = useState(0)
  const [mini, setMini] = useState(false)
  const idxRef = useRef(0)

  useEffect(() => {
    fetch('/api/call-script', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setCfg(d) }).catch(() => {})
  }, [])

  // nova ligação = recomeça do zero
  useEffect(() => { if (ativa) { setEtapa(0); idxRef.current = 0; setMini(false) } }, [ativa])

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
        📜 Roteiro · etapa {etapa + 1}/{etapas.length}
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
            {cfg.script.nome} · <span style={{ color: '#a5b4fc' }}>etapa {etapa + 1} de {etapas.length}</span>
          </p>
          <button onClick={() => setMini(true)} title="Minimizar"
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14, padding: 2 }}>—</button>
        </div>
        {/* trilha de etapas clicável */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
          {etapas.map((x, i) => (
            <button key={x.id} onClick={() => setEtapa(i)} title={`${i + 1}. ${x.titulo}`}
              style={{
                flex: 1, height: 5, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 0,
                background: i < etapa ? '#34d399' : i === etapa ? '#818cf8' : 'rgba(255,255,255,0.14)',
              }} />
          ))}
        </div>
      </div>

      {/* etapa atual */}
      <div style={{ padding: '12px 14px', overflowY: 'auto', flex: 1 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{etapa + 1}. {e.titulo}</p>
        {e.objetivo && (
          <p style={{ margin: '3px 0 10px', fontSize: 11.5, color: '#818cf8', fontWeight: 700 }}>🎯 {e.objetivo}</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {e.falas.map((f, i) => (
            <p key={i} style={{
              margin: 0, fontSize: 13, lineHeight: 1.45, color: '#f1f5f9',
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
          <p style={{ margin: '0 0 8px', fontSize: 11, color: '#94a3b8' }}>✅ Avance quando: <b style={{ color: '#cbd5e1' }}>{e.gatilho}</b></p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setEtapa(x => Math.max(0, x - 1))} disabled={etapa === 0}
            style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: etapa === 0 ? 'default' : 'pointer', opacity: etapa === 0 ? 0.4 : 1 }}>
            ← Voltar
          </button>
          <button onClick={() => setEtapa(x => Math.min(etapas.length - 1, x + 1))} disabled={etapa >= etapas.length - 1}
            style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: 'none', background: etapa >= etapas.length - 1 ? 'rgba(52,211,153,0.25)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: etapa >= etapas.length - 1 ? 'default' : 'pointer' }}>
            {etapa >= etapas.length - 1 ? '🏁 Última etapa — feche a venda' : 'Próxima etapa →'}
          </button>
        </div>
      </div>
    </div>
  )
}
