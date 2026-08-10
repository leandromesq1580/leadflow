'use client'

import { useEffect, useState } from 'react'
import { SCRIPT_IUL_PADRAO, type CallScript, type EtapaScript } from '@/lib/call-script'

/**
 * Editor do ROTEIRO DE LIGAÇÃO (Fase 1) — liga/desliga o apoio e edita as etapas.
 *
 * O apoio nasce DESLIGADO (decisão do dono: cada corretor aceita se quer). Quando
 * ligado, o roteiro aparece ao lado do telefone durante a ligação, começando na
 * etapa 1, com navegação manual. `{{nome}}` nas falas vira o nome do lead.
 */
export function RoteiroClient() {
  const [enabled, setEnabled] = useState(false)
  const [script, setScript] = useState<CallScript | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [aberta, setAberta] = useState<number | null>(0)

  useEffect(() => {
    fetch('/api/call-script', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setEnabled(!!d.enabled); setScript(d.script) } })
      .catch(() => {}).finally(() => setCarregando(false))
  }, [])

  async function salvar(patch: { enabled?: boolean; script?: CallScript }, rotulo: string) {
    setSalvando(true); setAviso(null)
    try {
      const r = await fetch('/api/call-script', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      const d = await r.json()
      if (!r.ok) { setAviso(d.error || 'Não consegui salvar.'); setSalvando(false); return }
      setEnabled(d.enabled); setScript(d.script); setAviso(rotulo)
      setTimeout(() => setAviso(null), 2500)
    } catch { setAviso('Erro de conexão.') }
    setSalvando(false)
  }

  const setEtapa = (i: number, e: Partial<EtapaScript>) => {
    if (!script) return
    const etapas = script.etapas.map((x, j) => (j === i ? { ...x, ...e } : x))
    setScript({ ...script, etapas })
  }
  const mover = (i: number, dir: -1 | 1) => {
    if (!script) return
    const j = i + dir
    if (j < 0 || j >= script.etapas.length) return
    const etapas = [...script.etapas]
    ;[etapas[i], etapas[j]] = [etapas[j], etapas[i]]
    setScript({ ...script, etapas }); setAberta(j)
  }
  const remover = (i: number) => {
    if (!script || script.etapas.length <= 1) return
    if (!confirm(`Remover a etapa "${script.etapas[i].titulo}"?`)) return
    setScript({ ...script, etapas: script.etapas.filter((_, j) => j !== i) }); setAberta(null)
  }
  const adicionar = () => {
    if (!script) return
    const nova: EtapaScript = { id: `etapa-${Date.now()}`, titulo: 'Nova etapa', objetivo: '', falas: [''] }
    setScript({ ...script, etapas: [...script.etapas, nova] }); setAberta(script.etapas.length)
  }

  if (carregando) return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>Carregando…</div>
  if (!script) return null

  const inStyle = { width: '100%', padding: '8px 11px', borderRadius: 10, border: '1px solid #e8ecf4', fontSize: 13, color: '#1a1a2e', background: '#fff', outline: 'none' } as const
  const lbl = { fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', margin: '10px 0 4px' } as const

  return (
    <div className="max-w-[860px]">
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>📜 Roteiro de Ligação</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>
            Seu script de venda, etapa por etapa, ao lado do telefone durante a ligação
          </p>
        </div>
      </div>

      {/* opt-in */}
      <div className="rounded-2xl p-5 mb-5 flex items-center gap-4" style={{ background: enabled ? '#f0fdf4' : '#fff', border: `1px solid ${enabled ? '#bbf7d0' : '#e8ecf4'}` }}>
        <div className="flex-1">
          <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>Apoio durante a ligação</p>
          <p className="text-[12px] mt-0.5" style={{ color: '#64748b' }}>
            {enabled
              ? 'Ligado — o roteiro abre sozinho ao lado do telefone quando você liga pra um lead.'
              : 'Desligado — ative pra ver o roteiro ao lado do telefone durante as ligações. Você pode desligar quando quiser.'}
          </p>
        </div>
        <button onClick={() => salvar({ enabled: !enabled }, enabled ? 'Apoio desligado.' : 'Apoio ligado — faça uma ligação pra ver.')} disabled={salvando}
          className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
          style={{ background: enabled ? '#64748b' : 'linear-gradient(135deg,#10b981,#059669)' }}>
          {enabled ? 'Desligar' : 'Ativar apoio'}
        </button>
      </div>

      {aviso && (
        <div className="rounded-xl p-3 mb-4 text-[13px] font-semibold" style={{ background: '#f0fdfa', border: '1px solid #99f6e4', color: '#0f766e' }}>
          {aviso}
        </div>
      )}

      {/* editor */}
      <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <input value={script.nome} onChange={e => setScript({ ...script, nome: e.target.value })}
            className="flex-1 min-w-[220px] px-3 py-2 rounded-lg text-[14px] font-bold" style={{ border: '1px solid #e8ecf4', color: '#1a1a2e' }} />
          <button onClick={() => { if (confirm('Substituir seu roteiro pelo padrão IUL? Suas edições serão perdidas.')) setScript(SCRIPT_IUL_PADRAO) }}
            className="px-3 py-2 rounded-lg text-[12px] font-bold" style={{ background: '#f1f5f9', color: '#64748b' }}>
            ↺ Restaurar padrão IUL
          </button>
          <button onClick={() => salvar({ script }, 'Roteiro salvo.')} disabled={salvando}
            className="px-5 py-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            {salvando ? 'Salvando…' : 'Salvar roteiro'}
          </button>
        </div>

        <p className="text-[12px] mb-4" style={{ color: '#94a3b8' }}>
          Use <b>{'{{nome}}'}</b> nas falas — vira o primeiro nome do lead na hora da ligação. Uma fala por linha.
        </p>

        <div className="flex flex-col gap-2">
          {script.etapas.map((e, i) => {
            const aberto = aberta === i
            return (
              <div key={e.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #e8ecf4' }}>
                <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: aberto ? '#eef2ff' : '#fafbfc' }}>
                  <button onClick={() => setAberta(aberto ? null : i)} className="flex-1 text-left text-[13px] font-bold" style={{ color: '#1a1a2e', background: 'none', border: 'none', cursor: 'pointer' }}>
                    {i + 1}. {e.titulo} <span style={{ color: '#94a3b8', fontWeight: 500 }}>· {e.falas.filter(Boolean).length} fala(s)</span>
                  </button>
                  <button onClick={() => mover(i, -1)} disabled={i === 0} title="Subir" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                  <button onClick={() => mover(i, 1)} disabled={i === script.etapas.length - 1} title="Descer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', opacity: i === script.etapas.length - 1 ? 0.3 : 1 }}>↓</button>
                  <button onClick={() => remover(i)} title="Remover" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }}>✕</button>
                </div>
                {aberto && (
                  <div className="px-3 pb-3">
                    <label style={lbl}>Título da etapa</label>
                    <input value={e.titulo} onChange={ev => setEtapa(i, { titulo: ev.target.value })} style={inStyle} />
                    <label style={lbl}>Objetivo (o que precisa conseguir antes de avançar)</label>
                    <input value={e.objetivo} onChange={ev => setEtapa(i, { objetivo: ev.target.value })} style={inStyle} />
                    <label style={lbl}>Falas (uma por linha)</label>
                    <textarea value={e.falas.join('\n')} rows={Math.min(10, Math.max(3, e.falas.length + 1))}
                      onChange={ev => setEtapa(i, { falas: ev.target.value.split('\n') })}
                      style={{ ...inStyle, resize: 'vertical', lineHeight: 1.5 }} />
                    <label style={lbl}>Momentos de escutar (um por linha — aparecem em destaque 👂)</label>
                    <textarea value={(e.escutas || []).join('\n')} rows={2}
                      onChange={ev => setEtapa(i, { escutas: ev.target.value.split('\n').filter(x => x.trim()) })}
                      style={{ ...inStyle, resize: 'vertical' }} />
                    <label style={lbl}>Avançar quando…</label>
                    <input value={e.gatilho || ''} onChange={ev => setEtapa(i, { gatilho: ev.target.value })} style={inStyle} placeholder="ex.: cliente confirmou o valor mensal" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button onClick={adicionar} className="w-full mt-3 py-3 rounded-xl text-[13px] font-bold"
          style={{ background: '#f0f4ff', color: '#6366f1', border: '1px dashed #c7d2fe' }}>
          + Adicionar etapa
        </button>
      </div>

      <p className="text-[12px] mt-4" style={{ color: '#94a3b8' }}>
        💡 Ao salvar, o roteiro novo vale já na próxima ligação. As falas não são lidas em voz alta pra ninguém — só você vê.
      </p>
    </div>
  )
}
