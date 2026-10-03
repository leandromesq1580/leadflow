'use client'

import { useEffect, useId, useRef, useState } from 'react'

type Pipeline = { id: string; name: string; stages: { id: string; name: string }[] }
type Options = { eligible: boolean; pipelines: Pipeline[] }
export type ConfirmedPipelineEntry = {
  entry: { id: string; lead_id: string; pipeline_id: string; stage_id: string }
  pipeline: Pipeline
}

/** Silent repair, separate from ordinary stage moves and their automation semantics. */
export function AddExistingLeadToPipeline({ leadId, onAdded }: { leadId: string; onAdded?: (result: ConfirmedPipelineEntry) => void | Promise<void> }) {
  const controlId = useId()
  const [options, setOptions] = useState<Options | null>(null)
  const [error, setError] = useState('')
  const [terminal, setTerminal] = useState(false)
  const [refreshWarning, setRefreshWarning] = useState('')
  const [reload, setReload] = useState(0)
  const [open, setOpen] = useState(false)
  const [pipeline, setPipeline] = useState('')
  const [stage, setStage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const submitting = useRef(false)
  const endpoint = `/api/leads/${leadId}/pipeline-entry`

  useEffect(() => {
    const controller = new AbortController()
    fetch(endpoint, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        // Classify by HTTP even when an auth proxy returns a non-JSON body.
        const terminalMessage = response.status === 401 ? 'Sua sessão expirou. Entre novamente para consultar a inclusão no funil.'
          : response.status === 403 ? 'Sem permissão para incluir este lead. A inclusão é restrita ao responsável ou membro atribuído; a leitura pela agência não concede essa permissão.'
          : response.status === 404 ? 'Lead indisponível para inclusão: não encontrado ou arquivado.' : ''
        if (terminalMessage) {
          if (!controller.signal.aborted) { setTerminal(true); setError(terminalMessage) }
          return
        }
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o funil.')
        if (typeof data.eligible !== 'boolean' || !Array.isArray(data.pipelines)) throw new Error('Resposta inválida ao consultar o funil.')
        if (!controller.signal.aborted) { setOptions(data); setError('') }
      })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Falha de conexão.') })
    return () => controller.abort()
  }, [endpoint, reload])

  async function add() {
    if (submitting.current || !pipeline || !stage) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pipeline_id: pipeline, stage_id: stage }) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || `Não foi possível incluir o lead (HTTP ${response.status}).`)
      if (data?.success !== true || data?.silent !== true || typeof data?.changed !== 'boolean'
        || typeof data?.entry?.id !== 'string' || data.entry.lead_id !== leadId || data.entry.pipeline_id !== pipeline || data.entry.stage_id !== stage) {
        throw new Error('Não foi possível confirmar a inclusão. Tente novamente com a mesma seleção.')
      }
      setDone(true)
      // A confirmed write must never become a write-retry because refresh failed.
      const selectedPipeline = options?.pipelines.find(p => p.id === pipeline)
      if (onAdded && selectedPipeline) {
        try { await onAdded({ entry: data.entry, pipeline: selectedPipeline }) }
        catch { setRefreshWarning('Inclusão confirmada, mas não foi possível atualizar a visualização. Reabra o lead; não é necessário incluir novamente.') }
      }
    } catch (error) {
      setError(error instanceof TypeError ? 'Falha de conexão. Tente novamente com a mesma seleção.' : error instanceof Error ? error.message : 'Não foi possível confirmar a inclusão.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const control = { width: '100%', minHeight: 44, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--m-border, var(--border, #777))', background: 'var(--m-bg, var(--bg-card, #fff))', color: 'var(--m-text, var(--fg, #111))' }
  const button = { ...control, width: 'auto', cursor: 'pointer' }
  if (done) return <div role="status" style={{ margin: '12px 0' }}><p>Lead incluído no funil. Nenhuma automação foi iniciada.</p>{refreshWarning && <p>{refreshWarning}</p>}</div>
  if (options && !options.eligible) return <p style={{ fontSize: 13, margin: '12px 0' }}>Lead já está em um funil.</p>
  return <section aria-label="Inclusão no funil" style={{ margin: '12px 0 20px', fontSize: 14, maxWidth: 480 }}>
    {!options && !error && <p>Consultando funil…</p>}
    {error && <p role="alert" style={{ color: 'var(--danger, #dc2626)', overflowWrap: 'anywhere' }}>{error}</p>}
    {!options && error && !terminal && <button type="button" style={button} onClick={() => { setError(''); setReload(n => n + 1) }}>Tentar novamente</button>}
    {options && !open && <button type="button" style={button} onClick={() => setOpen(true)}>Adicionar ao funil</button>}
    {options && open && <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0 }}>Adicionar ao funil sem iniciar sequências, follow-ups ou automações. O responsável e os créditos não mudam.</p>
      <label htmlFor={`${controlId}-pipeline`}>Funil</label><select id={`${controlId}-pipeline`} style={control} value={pipeline} disabled={busy} onChange={event => { setPipeline(event.target.value); setStage('') }}>
        <option value="">Selecione o funil</option>
        {options.pipelines.map(p => <option key={p.id} value={p.id} disabled={!p.stages.length}>{p.name}{!p.stages.length ? ' (sem estágios)' : ''}</option>)}
      </select>
      <label htmlFor={`${controlId}-stage`}>Estágio</label><select id={`${controlId}-stage`} style={control} value={stage} disabled={busy || !pipeline} onChange={event => setStage(event.target.value)}>
        <option value="">Selecione o estágio</option>
        {(options.pipelines.find(p => p.id === pipeline)?.stages || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {!options.pipelines.some(p => p.stages.length) && <p>Nenhum funil com estágio disponível. Configure um funil antes de incluir o lead.</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" style={button} disabled={busy || !pipeline || !stage} aria-busy={busy} onClick={add}>Confirmar inclusão</button>
        <button type="button" style={button} disabled={busy} onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>}
  </section>
}
