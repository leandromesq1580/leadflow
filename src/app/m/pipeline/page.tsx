'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { StageSheet } from '@/components/mobile/stage-sheet'
import { getInitials, timeAgo } from '@/lib/utils'

interface Stage { id: string; name: string; color: string; position: number }
interface PLead {
  id: string; stage_id: string
  lead: { id: string; name: string; phone: string; city: string; state: string; status: string; interest: string; created_at: string }
}

function avatarBg(name: string) {
  const h = ((name?.charCodeAt(0) || 65) * 37) % 360
  return `linear-gradient(135deg, hsl(${h}, 62%, 52%), hsl(${(h + 40) % 360}, 62%, 46%))`
}

export default function MobilePipeline() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)

  const [buyerId, setBuyerId] = useState<string | null>(null)
  const [pipeline, setPipeline] = useState<{ id: string; stages: Stage[] } | null>(null)
  const [cards, setCards] = useState<PLead[] | null>(null)
  const [activeStage, setActiveStage] = useState<string | null>(null)
  const [moveCard, setMoveCard] = useState<PLead | null>(null)
  const [noPipeline, setNoPipeline] = useState(false)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState(false)

  useEffect(() => {
    fetch('/api/m/team-context', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.buyer_id) { setBuyerId(d.buyer_id); loadPipeline(d.buyer_id) } else setErr(true) })
      .catch(() => setErr(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadPipeline(bid: string) {
    try {
      const r = await fetch(`/api/pipelines?buyer_id=${bid}`, { cache: 'no-store' })
      const d = await r.json()
      const pipes = d.pipelines || []
      if (pipes.length === 0) { setNoPipeline(true); setCards([]); return }
      const def = pipes.find((p: any) => p.is_default) || pipes[0]
      const stages = (def.stages || []).slice().sort((a: Stage, b: Stage) => a.position - b.position)
      setPipeline({ id: def.id, stages })
      setActiveStage(prev => prev || stages[0]?.id || null)
      loadLeads(def.id)
    } catch { setErr(true) }
  }

  async function loadLeads(pid: string) {
    try {
      const r = await fetch(`/api/pipelines/${pid}/leads`, { cache: 'no-store' })
      const d = await r.json()
      setCards(d.leads || [])
    } catch { setErr(true) }
  }

  async function createPipeline() {
    if (!buyerId) return
    setCreating(true)
    try {
      await fetch('/api/pipelines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buyer_id: buyerId, name: 'Vendas', populate_existing: true }) })
      setNoPipeline(false)
      await loadPipeline(buyerId)
    } catch {}
    setCreating(false)
  }

  async function moveTo(card: PLead, stageId: string) {
    setCards(prev => (prev || []).map(c => c.id === card.id ? { ...c, stage_id: stageId } : c))
    setActiveStage(stageId)
    try {
      const r = await fetch(`/api/pipeline-leads/${card.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage_id: stageId, position: 0 }) })
      if (!r.ok) throw new Error('move failed')
      if (pipeline) loadLeads(pipeline.id)
    } catch {
      setCards(prev => (prev || []).map(c => c.id === card.id ? { ...c, stage_id: card.stage_id } : c))
    }
  }

  const stages = pipeline?.stages || []
  const countByStage = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of cards || []) m[c.stage_id] = (m[c.stage_id] || 0) + 1
    return m
  }, [cards])
  const shown = (cards || []).filter(c => c.stage_id === activeStage)

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 8 }}>
        <p style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 800 }}>{t.sidebar.pipeline}</p>
      </div>

      {/* empty state */}
      {noPipeline && (
        <div className="m-pad" style={{ paddingTop: 50, textAlign: 'center' }}>
          <div className="m-icb" style={{ width: 66, height: 66, borderRadius: 20, margin: '0 auto 18px' }}><MIcon name="columns" size={30} /></div>
          <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 8px' }}>{L('Crie seu funil', 'Create your pipeline', 'Crea tu embudo')}</h2>
          <p className="m-muted" style={{ fontSize: 14, lineHeight: 1.5, maxWidth: 280, margin: '0 auto 22px' }}>{L('Organize seus leads por etapa e acompanhe cada negócio até fechar.', 'Organize your leads by stage and track every deal to close.', 'Organiza tus leads por etapa y sigue cada trato.')}</p>
          <button onClick={createPipeline} disabled={creating} className="m-tap" style={{ background: 'var(--m-grad)', color: '#fff', border: 'none', borderRadius: 14, height: 48, padding: '0 26px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: creating ? 0.6 : 1 }}>
            {creating ? L('Criando…', 'Creating…', 'Creando…') : L('Criar meu funil', 'Create my pipeline', 'Crear mi embudo')}
          </button>
        </div>
      )}

      {/* loading */}
      {!noPipeline && !cards && !err && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><div className="m-spin" /></div>}
      {err && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 60 }}>{L('Não consegui carregar agora.', "Couldn't load right now.", 'No pude cargar ahora.')}</p>}

      {/* stage selector */}
      {!noPipeline && pipeline && cards && (
        <>
          <div className="m-pad" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 14 }}>
            {stages.map(s => (
              <span key={s.id} className={`m-chip m-tap${activeStage === s.id ? ' on' : ''}`} onClick={() => setActiveStage(s.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                {s.name}
                <span style={{ opacity: 0.75 }}>{countByStage[s.id] || 0}</span>
              </span>
            ))}
          </div>

          <div className="m-pad">
            {shown.length === 0
              ? <p className="m-muted" style={{ textAlign: 'center', paddingTop: 30, fontSize: 14 }}>{L('Nenhum lead nesta etapa.', 'No leads in this stage.', 'Sin leads en esta etapa.')}</p>
              : shown.map(c => (
                <div key={c.id} className="m-card" style={{ padding: 12, marginBottom: 11, display: 'flex', alignItems: 'center', gap: 11 }}>
                  <Link href={`/m/leads/${c.lead.id}`} className="m-link" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div className="m-av" style={{ width: 44, height: 44, fontSize: 14, background: avatarBg(c.lead.name) }}>{getInitials(c.lead.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lead.name}</p>
                      <p className="m-muted" style={{ margin: '2px 0 0', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[[c.lead.city, c.lead.state].filter(Boolean).join(', '), timeAgo(c.lead.created_at, loc)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </Link>
                  <button className="m-tap" onClick={() => setMoveCard(c)} aria-label={L('Mover', 'Move', 'Mover')} style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    <MIcon name="columns" size={18} />
                  </button>
                </div>
              ))}
          </div>
        </>
      )}

      {moveCard && pipeline && (
        <StageSheet
          stages={stages}
          currentStageId={moveCard.stage_id}
          locale={loc}
          onClose={() => setMoveCard(null)}
          onPick={(sid) => moveTo(moveCard, sid)}
        />
      )}
    </div>
  )
}
