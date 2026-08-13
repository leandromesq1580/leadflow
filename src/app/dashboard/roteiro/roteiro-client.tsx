'use client'

import { useEffect, useState } from 'react'
import { SCRIPT_IUL_PADRAO, type CallScript, type EtapaScript } from '@/lib/call-script'
import { useT } from '@/lib/i18n-client'

/**
 * Editor do ROTEIRO DE LIGAÇÃO (Fase 1) — liga/desliga o apoio e edita as etapas.
 *
 * O apoio nasce DESLIGADO (decisão do dono: cada corretor aceita se quer). Quando
 * ligado, o roteiro aparece ao lado do telefone durante a ligação, começando na
 * etapa 1, com navegação manual. `{{nome}}` nas falas vira o nome do lead.
 */
export function RoteiroClient() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [enabled, setEnabled] = useState(false)
  const [script, setScript] = useState<CallScript | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [aberta, setAberta] = useState<number | null>(0)
  const [ia, setIa] = useState<{ ativa: boolean; minutos: number; ligacoes: number; franquia: number } | null>(null)
  const [assinando, setAssinando] = useState(false)

  useEffect(() => {
    fetch('/api/call-script', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setEnabled(!!d.enabled); setScript(d.script); setIa(d.ia || null) } })
      .catch(() => {}).finally(() => setCarregando(false))
  }, [])

  // voltou do checkout do add-on? o webhook leva uns segundos — fica de olho
  useEffect(() => {
    if (ia?.ativa) return
    const p = new URLSearchParams(window.location.search)
    if (p.get('addon') !== 'ok') return
    const timer = setInterval(async () => {
      try {
        const d = await fetch('/api/call-script', { cache: 'no-store' }).then(r => r.json())
        if (d?.ia?.ativa) { setIa(d.ia); clearInterval(timer) }
      } catch {}
    }, 3000)
    return () => clearInterval(timer)
  }, [ia?.ativa])

  async function assinarIa() {
    setAssinando(true)
    try {
      const r = await fetch('/api/roteiro/checkout', { method: 'POST' })
      const d = await r.json()
      if (!r.ok || !d.url) { setAviso(d.error || L('Não consegui abrir o pagamento.', 'Could not open checkout.', 'No pude abrir el pago.')); setAssinando(false); return }
      window.location.href = d.url
    } catch { setAviso(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')); setAssinando(false) }
  }

  async function salvar(patch: { enabled?: boolean; script?: CallScript }, rotulo: string) {
    setSalvando(true); setAviso(null)
    try {
      const r = await fetch('/api/call-script', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      const d = await r.json()
      if (!r.ok) { setAviso(d.error || L('Não consegui salvar.', 'Could not save.', 'No pude guardar.')); setSalvando(false); return }
      setEnabled(d.enabled); setScript(d.script); setAviso(rotulo)
      setTimeout(() => setAviso(null), 2500)
    } catch { setAviso(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')) }
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
    if (!confirm(L(`Remover a etapa "${script.etapas[i].titulo}"?`, `Remove the step "${script.etapas[i].titulo}"?`, `¿Eliminar la etapa "${script.etapas[i].titulo}"?`))) return
    setScript({ ...script, etapas: script.etapas.filter((_, j) => j !== i) }); setAberta(null)
  }
  const adicionar = () => {
    if (!script) return
    const nova: EtapaScript = { id: `etapa-${Date.now()}`, titulo: L('Nova etapa', 'New step', 'Nueva etapa'), objetivo: '', falas: [''] }
    setScript({ ...script, etapas: [...script.etapas, nova] }); setAberta(script.etapas.length)
  }

  if (carregando) return <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 13 }}>{L('Carregando…', 'Loading…', 'Cargando…')}</div>
  if (!script) return null

  const inStyle = { width: '100%', padding: '8px 11px', borderRadius: 10, border: '1px solid #e8ecf4', fontSize: 13, color: '#1a1a2e', background: '#fff', outline: 'none' } as const
  const lbl = { fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', margin: '10px 0 4px' } as const

  return (
    <div className="max-w-[860px]">
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>{L('📜 Roteiro de Ligação', '📜 Call Script', '📜 Guion de Llamada')}</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>
            {L('Seu script de venda, etapa por etapa, ao lado do telefone durante a ligação',
               'Your sales script, step by step, next to the phone during the call',
               'Tu guion de venta, etapa por etapa, junto al teléfono durante la llamada')}
          </p>
        </div>
      </div>

      {/* opt-in */}
      <div className="rounded-2xl p-5 mb-5 flex items-center gap-4" style={{ background: enabled ? '#f0fdf4' : '#fff', border: `1px solid ${enabled ? '#bbf7d0' : '#e8ecf4'}` }}>
        <div className="flex-1">
          <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>{L('Apoio durante a ligação', 'Support during the call', 'Apoyo durante la llamada')}</p>
          <p className="text-[12px] mt-0.5" style={{ color: '#64748b' }}>
            {enabled
              ? L('Ligado — o roteiro abre sozinho ao lado do telefone quando você liga pra um lead.',
                  'On — the script opens on its own next to the phone when you call a lead.',
                  'Activado — el guion se abre solo junto al teléfono cuando llamas a un lead.')
              : L('Desligado — ative pra ver o roteiro ao lado do telefone durante as ligações. Você pode desligar quando quiser.',
                  'Off — turn it on to see the script next to the phone during calls. You can turn it off anytime.',
                  'Desactivado — actívalo para ver el guion junto al teléfono durante las llamadas. Puedes desactivarlo cuando quieras.')}
          </p>
        </div>
        <button onClick={() => salvar({ enabled: !enabled }, enabled
            ? L('Apoio desligado.', 'Support turned off.', 'Apoyo desactivado.')
            : L('Apoio ligado — faça uma ligação pra ver.', 'Support turned on — make a call to see it.', 'Apoyo activado — haz una llamada para verlo.'))} disabled={salvando}
          className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
          style={{ background: enabled ? '#64748b' : 'linear-gradient(135deg,#10b981,#059669)' }}>
          {enabled ? L('Desligar', 'Turn off', 'Desactivar') : L('Ativar apoio', 'Turn on support', 'Activar apoyo')}
        </button>
      </div>

      {/* add-on IA na Ligação ($49/mês): a transcrição+sugestão ao vivo é paga; o roteiro estático segue grátis */}
      {ia?.ativa ? (
        <div className="rounded-2xl p-5 mb-5" style={{ background: '#eef2ff', border: '1px solid #c7d2fe' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[14px] font-bold" style={{ color: '#3730a3' }}>🤖 {L('IA na Ligação — ativa', 'AI on the Call — active', 'IA en la Llamada — activa')}</p>
              <p className="text-[12px] mt-0.5" style={{ color: '#6366f1' }}>
                {L('Nas suas ligações, o painel mostra "● ouvindo" e o cartão verde com a sugestão quando o cliente fala.',
                   'On your calls, the panel shows "● listening" and the green card with the suggestion when the client speaks.',
                   'En tus llamadas, el panel muestra "● escuchando" y la tarjeta verde con la sugerencia cuando el cliente habla.')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[18px] font-extrabold" style={{ color: ia.minutos > ia.franquia ? '#d97706' : '#3730a3' }}>
                {ia.minutos} <span className="text-[12px] font-semibold">/ {ia.franquia} min</span>
              </p>
              <p className="text-[11px]" style={{ color: '#818cf8' }}>{L('escutados este mês', 'listened this month', 'escuchados este mes')} · {ia.ligacoes} {L('ligações', 'calls', 'llamadas')}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-5 mb-5 flex items-center gap-4 flex-wrap" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <div className="flex-1 min-w-[260px]">
            <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>🤖 {L('IA na Ligação', 'AI on the Call', 'IA en la Llamada')} <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#eef2ff', color: '#6366f1' }}>{L('ADD-ON', 'ADD-ON', 'ADD-ON')}</span></p>
            <p className="text-[12px] mt-0.5" style={{ color: '#64748b' }}>
              {L('A IA escuta sua ligação AO VIVO e sugere a resposta do seu script na hora — inclusive o contorno da objeção que o cliente acabou de levantar. Inclui 600 min de escuta/mês.',
                 'The AI listens to your call LIVE and suggests your script’s answer on the spot — including the rebuttal to the objection the client just raised. Includes 600 min of listening/mo.',
                 'La IA escucha tu llamada EN VIVO y sugiere la respuesta de tu guion al instante — incluido el manejo de la objeción que el cliente acaba de plantear. Incluye 600 min de escucha/mes.')}
            </p>
          </div>
          <button onClick={assinarIa} disabled={assinando}
            className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
            {assinando ? L('Abrindo…', 'Opening…', 'Abriendo…') : L('Assinar — $49/mês', 'Subscribe — $49/mo', 'Suscribir — $49/mes')}
          </button>
        </div>
      )}

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
          <button onClick={() => { if (confirm(L('Substituir seu roteiro pelo padrão IUL? Suas edições serão perdidas.', 'Replace your script with the IUL default? Your edits will be lost.', '¿Reemplazar tu guion por el estándar IUL? Tus ediciones se perderán.'))) setScript(SCRIPT_IUL_PADRAO) }}
            className="px-3 py-2 rounded-lg text-[12px] font-bold" style={{ background: '#f1f5f9', color: '#64748b' }}>
            {L('↺ Restaurar padrão IUL', '↺ Restore IUL default', '↺ Restaurar estándar IUL')}
          </button>
          <button onClick={() => salvar({ script }, L('Roteiro salvo.', 'Script saved.', 'Guion guardado.'))} disabled={salvando}
            className="px-5 py-2 rounded-xl text-[13px] font-bold text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            {salvando ? L('Salvando…', 'Saving…', 'Guardando…') : L('Salvar roteiro', 'Save script', 'Guardar guion')}
          </button>
        </div>

        <p className="text-[12px] mb-4" style={{ color: '#94a3b8' }}>
          {L('Use ', 'Use ', 'Usa ')}<b>{'{{nome}}'}</b>{L(' nas falas — vira o primeiro nome do lead na hora da ligação. Uma fala por linha.',
            ' in the lines — it becomes the lead’s first name during the call. One line per sentence.',
            ' en las frases — se convierte en el primer nombre del lead durante la llamada. Una frase por línea.')}
        </p>

        <div className="flex flex-col gap-2">
          {script.etapas.map((e, i) => {
            const aberto = aberta === i
            return (
              <div key={e.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #e8ecf4' }}>
                <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: aberto ? '#eef2ff' : '#fafbfc' }}>
                  <button onClick={() => setAberta(aberto ? null : i)} className="flex-1 text-left text-[13px] font-bold" style={{ color: '#1a1a2e', background: 'none', border: 'none', cursor: 'pointer' }}>
                    {i + 1}. {e.titulo} <span style={{ color: '#94a3b8', fontWeight: 500 }}>· {L(`${e.falas.filter(Boolean).length} fala(s)`, `${e.falas.filter(Boolean).length} line(s)`, `${e.falas.filter(Boolean).length} frase(s)`)}</span>
                  </button>
                  <button onClick={() => mover(i, -1)} disabled={i === 0} title={L('Subir', 'Move up', 'Subir')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                  <button onClick={() => mover(i, 1)} disabled={i === script.etapas.length - 1} title={L('Descer', 'Move down', 'Bajar')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', opacity: i === script.etapas.length - 1 ? 0.3 : 1 }}>↓</button>
                  <button onClick={() => remover(i)} title={L('Remover', 'Remove', 'Eliminar')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }}>✕</button>
                </div>
                {aberto && (
                  <div className="px-3 pb-3">
                    <label style={lbl}>{L('Título da etapa', 'Step title', 'Título de la etapa')}</label>
                    <input value={e.titulo} onChange={ev => setEtapa(i, { titulo: ev.target.value })} style={inStyle} />
                    <label style={lbl}>{L('Objetivo (o que precisa conseguir antes de avançar)', 'Goal (what you need to achieve before moving on)', 'Objetivo (lo que necesitas lograr antes de avanzar)')}</label>
                    <input value={e.objetivo} onChange={ev => setEtapa(i, { objetivo: ev.target.value })} style={inStyle} />
                    <label style={lbl}>{L('Falas (uma por linha)', 'Lines (one per line)', 'Frases (una por línea)')}</label>
                    <textarea value={e.falas.join('\n')} rows={Math.min(10, Math.max(3, e.falas.length + 1))}
                      onChange={ev => setEtapa(i, { falas: ev.target.value.split('\n') })}
                      style={{ ...inStyle, resize: 'vertical', lineHeight: 1.5 }} />
                    <label style={lbl}>{L('Momentos de escutar (um por linha — aparecem em destaque 👂)', 'Listening moments (one per line — shown highlighted 👂)', 'Momentos de escuchar (uno por línea — aparecen destacados 👂)')}</label>
                    <textarea value={(e.escutas || []).join('\n')} rows={2}
                      onChange={ev => setEtapa(i, { escutas: ev.target.value.split('\n').filter(x => x.trim()) })}
                      style={{ ...inStyle, resize: 'vertical' }} />
                    <label style={lbl}>{L('Avançar quando…', 'Advance when…', 'Avanzar cuando…')}</label>
                    <input value={e.gatilho || ''} onChange={ev => setEtapa(i, { gatilho: ev.target.value })} style={inStyle}
                      placeholder={L('ex.: cliente confirmou o valor mensal', 'e.g.: client confirmed the monthly amount', 'ej.: el cliente confirmó el monto mensual')} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button onClick={adicionar} className="w-full mt-3 py-3 rounded-xl text-[13px] font-bold"
          style={{ background: '#f0f4ff', color: '#6366f1', border: '1px dashed #c7d2fe' }}>
          {L('+ Adicionar etapa', '+ Add step', '+ Agregar etapa')}
        </button>
      </div>

      <p className="text-[12px] mt-4" style={{ color: '#94a3b8' }}>
        {L('💡 Ao salvar, o roteiro novo vale já na próxima ligação. As falas não são lidas em voz alta pra ninguém — só você vê.',
           '💡 Once saved, the new script applies to your very next call. The lines are never read out loud to anyone — only you see them.',
           '💡 Al guardar, el guion nuevo aplica desde la próxima llamada. Las frases no se leen en voz alta a nadie — solo tú las ves.')}
      </p>
    </div>
  )
}
