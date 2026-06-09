'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Campaign { id: string; name: string; body: string; total: number; sent: number; failed: number; status: string; created_at: string }
interface Reply { id: string; from_phone: string; body: string; created_at: string; lead_name: string | null; lead_id: string | null; lead_state: string | null }
interface BuyerOpt { id: string; name: string }
interface Props { campaigns: Campaign[]; replies: Reply[]; buyers: BuyerOpt[] }

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function SmsClient({ campaigns, replies, buyers }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'nova' | 'campanhas' | 'respostas'>('nova')

  // composer
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [states, setStates] = useState<string[]>([])
  const [buyerId, setBuyerId] = useState('')
  const [days, setDays] = useState(0)
  // segmentação por pipeline/coluna do dono
  const [pipelines, setPipelines] = useState<{ id: string; name: string; stages: { id: string; name: string }[] }[]>([])
  const [pipelineId, setPipelineId] = useState('')
  const [stageId, setStageId] = useState('')
  const [estimate, setEstimate] = useState<{ total: number; segments_per_msg: number; est_cost_usd: number; sample_rendered: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // progresso do disparo
  const [progress, setProgress] = useState<{ total: number; sent: number; failed: number } | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  /** Insere a variável na posição do cursor do textarea. */
  function inserirVariavel(v: string) {
    const el = bodyRef.current
    setEstimate(null)
    if (!el) { setBody(b => b + v); return }
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    const novo = body.slice(0, start) + v + body.slice(end)
    setBody(novo)
    setTimeout(() => { el.focus(); el.setSelectionRange(start + v.length, start + v.length) }, 0)
  }

  const filters = {
    states: states.length ? states : undefined,
    buyer_id: buyerId || undefined,
    days: days || undefined,
    pipeline_id: pipelineId || undefined,
    stage_id: stageId || undefined,
  }

  async function trocarDono(id: string) {
    setBuyerId(id); setPipelineId(''); setStageId(''); setPipelines([]); setEstimate(null)
    if (!id) return
    try {
      const r = await fetch(`/api/admin/sms/pipelines?buyer_id=${id}`)
      const d = await r.json()
      if (r.ok) setPipelines(d.pipelines || [])
    } catch {}
  }

  async function calcular() {
    setErr(''); setEstimate(null); setBusy(true)
    try {
      const r = await fetch('/api/admin/sms/campaign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true, body, filters }),
      })
      const d = await r.json()
      if (!r.ok) setErr(d.error || 'Falha ao calcular')
      else setEstimate(d)
    } catch { setErr('Erro de rede') }
    setBusy(false)
  }

  async function disparar() {
    if (!estimate) return
    if (!confirm(`Disparar SMS pra ${estimate.total} leads (~$${estimate.est_cost_usd})?\n\nIsso envia de verdade. Não tem desfazer.`)) return
    setErr(''); setBusy(true); setProgress({ total: estimate.total, sent: 0, failed: 0 })
    try {
      const r = await fetch('/api/admin/sms/campaign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, body, filters }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Falha ao criar campanha'); setBusy(false); setProgress(null); return }

      // loop de lotes até esvaziar a fila
      let remaining = d.total
      let guard = 0
      while (remaining > 0 && guard < 500) {
        guard++
        const dr = await fetch('/api/admin/sms/dispatch', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaign_id: d.campaign_id, batch: 20 }),
        })
        const dd = await dr.json()
        if (!dr.ok) { setErr(dd.error || 'Falha no disparo (pode retomar depois — a fila fica salva)'); break }
        remaining = dd.remaining
        setProgress({ total: d.total, sent: dd.total_sent, failed: dd.total_failed })
      }
      router.refresh()
      setTab('campanhas')
    } catch { setErr('Erro de rede durante o disparo — a fila fica salva, recarregue e use "Retomar".') }
    setBusy(false)
  }

  async function retomar(campaignId: string, total: number) {
    setBusy(true); setErr('')
    let remaining = 1, guard = 0
    let lastSent = 0, lastFailed = 0
    while (remaining > 0 && guard < 500) {
      guard++
      const dr = await fetch('/api/admin/sms/dispatch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, batch: 20 }),
      })
      const dd = await dr.json()
      if (!dr.ok) { setErr(dd.error || 'Falha ao retomar'); break }
      remaining = dd.remaining; lastSent = dd.total_sent; lastFailed = dd.total_failed
      setProgress({ total, sent: lastSent, failed: lastFailed })
    }
    setBusy(false); setProgress(null); router.refresh()
  }

  const inputCls = 'px-3 py-2.5 rounded-lg text-[13px] border w-full'
  const inputStyle = { borderColor: '#e8ecf4', color: '#1a1a2e', background: '#fff' }
  const tabBtn = (t: typeof tab, label: string) => (
    <button onClick={() => setTab(t)} className="px-4 py-2 rounded-lg text-[13px] font-bold"
      style={{ background: tab === t ? '#1a1a2e' : '#f1f5f9', color: tab === t ? '#fff' : '#64748b' }}>
      {label}
    </button>
  )

  return (
    <div>
      <div className="flex gap-2 mb-5">
        {tabBtn('nova', '➕ Nova Campanha')}
        {tabBtn('campanhas', `📋 Campanhas (${campaigns.length})`)}
        {tabBtn('respostas', `📩 Respostas (${replies.length})`)}
      </div>

      {tab === 'nova' && (
        <div className="rounded-2xl p-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Nome da campanha</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="ex: Reativação junho" className={inputCls + ' mb-4'} style={inputStyle} />

          <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Mensagem</label>
          <textarea ref={bodyRef} value={body} onChange={e => { setBody(e.target.value); setEstimate(null) }} rows={4}
            placeholder={'Oi {nome}! Aqui é da National Life...'}
            className={inputCls + ' resize-none mb-2'} style={inputStyle} />
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Inserir variável:</span>
            {[
              { v: '{nome}', label: '👤 Primeiro nome' },
              { v: '{nome_completo}', label: '👤 Nome completo' },
              { v: '{estado}', label: '📍 Estado' },
            ].map(x => (
              <button key={x.v} type="button" onClick={() => inserirVariavel(x.v)}
                title={`Insere ${x.v} na posição do cursor — vira o dado real de cada lead no envio`}
                className="px-2.5 py-1 rounded-lg text-[12px] font-bold"
                style={{ background: '#eef2ff', color: '#6366f1', border: '1px solid #c7d2fe' }}>
                {x.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] mb-4" style={{ color: '#94a3b8' }}>
            {body.length} caracteres · no envio, {'{nome}'} vira o nome real de cada lead (ex: "Oi {'{nome}'}!" → "Oi Maria!")
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Estados (vazio = todos)</label>
              <select multiple value={states} onChange={e => { setStates(Array.from(e.target.selectedOptions).map(o => o.value)); setEstimate(null) }}
                className={inputCls} style={{ ...inputStyle, height: 110 }}>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Dono do lead</label>
              <select value={buyerId} onChange={e => trocarDono(e.target.value)} className={inputCls + ' cursor-pointer'} style={inputStyle}>
                <option value="">Todos</option>
                {buyers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>

              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 mt-3" style={{ color: '#94a3b8' }}>Pipeline do dono</label>
              <select value={pipelineId} disabled={!buyerId || pipelines.length === 0}
                onChange={e => { setPipelineId(e.target.value); setStageId(''); setEstimate(null) }}
                className={inputCls + ' cursor-pointer disabled:opacity-50'} style={inputStyle}>
                <option value="">{!buyerId ? 'Escolha o dono primeiro' : pipelines.length === 0 ? 'Dono sem pipeline' : 'Pipeline inteira (qualquer)'}</option>
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 mt-3" style={{ color: '#94a3b8' }}>Coluna (estágio)</label>
              <select value={stageId} disabled={!pipelineId}
                onChange={e => { setStageId(e.target.value); setEstimate(null) }}
                className={inputCls + ' cursor-pointer disabled:opacity-50'} style={inputStyle}>
                <option value="">{!pipelineId ? 'Escolha a pipeline primeiro' : 'Todas as colunas'}</option>
                {(pipelines.find(p => p.id === pipelineId)?.stages || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 mt-3" style={{ color: '#94a3b8' }}>Leads dos últimos</label>
              <select value={days} onChange={e => { setDays(Number(e.target.value)); setEstimate(null) }} className={inputCls + ' cursor-pointer'} style={inputStyle}>
                <option value={0}>Sempre (todos)</option>
                <option value={7}>7 dias</option>
                <option value={30}>30 dias</option>
                <option value={90}>90 dias</option>
              </select>
            </div>
            <div className="rounded-xl p-4" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>Estimativa</p>
              {estimate ? (
                <>
                  <p className="text-[22px] font-extrabold" style={{ color: '#1a1a2e' }}>{estimate.total} <span className="text-[12px] font-semibold" style={{ color: '#94a3b8' }}>leads</span></p>
                  <p className="text-[12px] mt-1" style={{ color: '#64748b' }}>{estimate.segments_per_msg} segmento(s)/SMS · ~${estimate.est_cost_usd}</p>
                  <p className="text-[11px] mt-2 italic" style={{ color: '#94a3b8' }}>"{estimate.sample_rendered.slice(0, 90)}…"</p>
                </>
              ) : (
                <p className="text-[12px]" style={{ color: '#94a3b8' }}>Clique em "Calcular público" pra ver total e custo.</p>
              )}
            </div>
          </div>

          {err && <p className="text-[13px] mb-3 px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#dc2626' }}>{err}</p>}

          {progress && (
            <div className="mb-3">
              <div className="h-3 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                <div className="h-full transition-all" style={{ width: `${Math.round(((progress.sent + progress.failed) / Math.max(progress.total, 1)) * 100)}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
              </div>
              <p className="text-[12px] mt-1 font-semibold" style={{ color: '#64748b' }}>
                {progress.sent} enviados · {progress.failed} falhas · {progress.total - progress.sent - progress.failed} restantes
              </p>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button onClick={calcular} disabled={busy || !body.trim()}
              className="px-5 py-2.5 rounded-xl text-[13px] font-bold disabled:opacity-50" style={{ background: '#eef2ff', color: '#6366f1' }}>
              {busy && !progress ? 'Calculando…' : 'Calcular público'}
            </button>
            <button onClick={disparar} disabled={busy || !estimate || !name.trim() || estimate.total === 0}
              className="px-6 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              {busy && progress ? 'Disparando…' : `🚀 Disparar${estimate ? ` (${estimate.total})` : ''}`}
            </button>
          </div>
        </div>
      )}

      {tab === 'campanhas' && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          {campaigns.length === 0 ? (
            <p className="text-[13px] px-6 py-8 text-center" style={{ color: '#94a3b8' }}>Nenhuma campanha ainda.</p>
          ) : campaigns.map((c, i) => {
            const pendentes = c.total - c.sent - c.failed
            return (
              <div key={c.id} className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: i < campaigns.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>{c.name}</p>
                  <p className="text-[12px] truncate" style={{ color: '#94a3b8' }}>{fmtDate(c.created_at)} · "{c.body.slice(0, 70)}"</p>
                </div>
                <div className="text-right text-[12px] font-semibold" style={{ color: '#64748b' }}>
                  <span style={{ color: '#15803d' }}>{c.sent} ✓</span>
                  {c.failed > 0 && <span className="ml-2" style={{ color: '#dc2626' }}>{c.failed} ✗</span>}
                  <span className="ml-2" style={{ color: '#94a3b8' }}>/ {c.total}</span>
                </div>
                {pendentes > 0 ? (
                  <button onClick={() => retomar(c.id, c.total)} disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-bold disabled:opacity-50" style={{ background: '#fff7ed', color: '#ea580c' }}>
                    ▶ Retomar ({pendentes})
                  </button>
                ) : (
                  <span className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{ background: c.status === 'done' ? '#dcfce7' : '#f1f5f9', color: c.status === 'done' ? '#15803d' : '#64748b' }}>
                    {c.status === 'done' ? 'Concluída' : c.status}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'respostas' && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          {replies.length === 0 ? (
            <p className="text-[13px] px-6 py-8 text-center" style={{ color: '#94a3b8' }}>
              Nenhuma resposta ainda. Quando alguém responder o SMS, aparece aqui e no grupo do WhatsApp.
            </p>
          ) : replies.map((r, i) => (
            <div key={r.id} className="px-6 py-4" style={{ borderBottom: i < replies.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[13px] font-bold" style={{ color: '#1a1a2e' }}>
                  {r.lead_name || 'Número não cadastrado'}
                  {r.lead_state && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#eef2ff', color: '#6366f1' }}>{r.lead_state}</span>}
                </p>
                <span className="text-[11px]" style={{ color: '#94a3b8' }}>+{r.from_phone} · {fmtDate(r.created_at)}</span>
              </div>
              <p className="text-[13px]" style={{ color: '#475569' }}>💬 {r.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
