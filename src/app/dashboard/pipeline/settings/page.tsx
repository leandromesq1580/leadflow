'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n-client'

interface Stage { id: string; name: string; color: string; position: number }
interface Pipeline { id: string; name: string; is_default: boolean; position?: number; stages: Stage[] }

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#f97316', '#059669', '#ef4444', '#ec4899', '#06b6d4', '#84cc16']

export default function PipelineSettingsPage() {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selected, setSelected] = useState<Pipeline | null>(null)
  const [buyerId, setBuyerId] = useState('')
  const [newName, setNewName] = useState('')
  const [newStageName, setNewStageName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null)
  const [editPipelineName, setEditPipelineName] = useState('')

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    if (cookie) {
      try {
        const token = JSON.parse(atob(decodeURIComponent(cookie.substring(cookie.indexOf('=') + 1))))
        const payload = JSON.parse(atob(token.access_token.split('.')[1]))
        fetchBuyer(payload.sub)
      } catch {}
    }
  }, [])

  async function fetchBuyer(authId: string) {
    const r = await fetch(`/api/settings?auth_user_id=${authId}`)
    const buyer = await r.json()
    setBuyerId(buyer.id)
    loadPipelines(buyer.id)
  }

  async function loadPipelines(bid: string) {
    const r = await fetch(`/api/pipelines?buyer_id=${bid}`)
    const d = await r.json()
    const list: Pipeline[] = d.pipelines || []
    setPipelines(list)
    // mantem a pipeline selecionada (refresca pelo id apos renomear/reordenar); senao a 1a
    setSelected(prev => (prev && list.find(p => p.id === prev.id)) || list[0] || null)
  }

  async function createPipeline() {
    if (!newName.trim()) return
    const populate_existing = confirm(L(
      'Trazer seus leads existentes pra esse novo pipeline?\n\n' +
      'OK = traz todos os seus leads atuais pra primeira coluna\n' +
      'Cancelar = pipeline vazio (você arrasta os leads que quiser depois)',
      'Bring your existing leads into this new pipeline?\n\n' +
      'OK = brings all your current leads into the first column\n' +
      'Cancel = empty pipeline (you drag in the leads you want later)',
      '¿Traer tus leads existentes a este nuevo pipeline?\n\n' +
      'OK = trae todos tus leads actuales a la primera columna\n' +
      'Cancelar = pipeline vacío (arrastras los leads que quieras después)',
    ))
    await fetch('/api/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyer_id: buyerId, name: newName, populate_existing }),
    })
    setNewName('')
    loadPipelines(buyerId)
  }

  async function deletePipeline(id: string) {
    if (!confirm(L('Deletar este pipeline?', 'Delete this pipeline?', '¿Eliminar este pipeline?'))) return
    const r = await fetch(`/api/pipelines/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const d = await r.json()
      alert(d.error || L('Erro ao deletar pipeline', 'Error deleting pipeline', 'Error al eliminar el pipeline'))
      return
    }
    setSelected(null)
    loadPipelines(buyerId)
  }

  function startRenamePipeline(p: Pipeline) {
    setEditingPipelineId(p.id)
    setEditPipelineName(p.name)
  }

  async function saveRenamePipeline() {
    const id = editingPipelineId
    const name = editPipelineName.trim()
    setEditingPipelineId(null)
    if (!id || !name) return
    await fetch(`/api/pipelines/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    loadPipelines(buyerId)
  }

  async function movePipeline(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= pipelines.length) return
    const arr = [...pipelines]
    const [moved] = arr.splice(idx, 1)
    arr.splice(target, 0, moved)
    setPipelines(arr) // otimista: reordena na tela na hora
    // reatribui posicoes 0..n e persiste TODAS (robusto a posicoes iguais/ausentes
    // antes da migration — a 1a reordenacao ja normaliza tudo)
    await Promise.all(arr.map((p, i) =>
      fetch(`/api/pipelines/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: i }),
      })
    ))
    loadPipelines(buyerId)
  }

  async function deleteStage(stageId: string) {
    if (!selected) return
    if (!confirm(L('Deletar este estágio?', 'Delete this stage?', '¿Eliminar esta etapa?'))) return
    const r = await fetch(`/api/pipelines/${selected.id}/stages/${stageId}`, { method: 'DELETE' })
    if (!r.ok) {
      const d = await r.json()
      alert(d.error || L('Erro ao deletar estágio', 'Error deleting stage', 'Error al eliminar la etapa'))
      return
    }
    loadPipelines(buyerId)
  }

  async function addStage() {
    if (!newStageName.trim() || !selected) return
    await fetch(`/api/pipelines/${selected.id}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newStageName, color: COLORS[selected.stages.length % COLORS.length] }),
    })
    setNewStageName('')
    loadPipelines(buyerId)
  }

  async function saveStages() {
    if (!selected) return
    setSaving(true)
    await fetch(`/api/pipelines/${selected.id}/stages`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stages: selected.stages }),
    })
    setSaving(false)
    loadPipelines(buyerId)
  }

  function updateStage(idx: number, field: string, value: string | number) {
    if (!selected) return
    const updated = { ...selected, stages: selected.stages.map((s, i) => i === idx ? { ...s, [field]: value } : s) }
    setSelected(updated)
  }

  function moveStage(idx: number, dir: -1 | 1) {
    if (!selected) return
    const stages = [...selected.stages]
    const target = idx + dir
    if (target < 0 || target >= stages.length) return
    const temp = stages[idx].position
    stages[idx].position = stages[target].position
    stages[target].position = temp
    stages.sort((a, b) => a.position - b.position)
    setSelected({ ...selected, stages })
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[24px] font-extrabold" style={{ color: 'var(--fg)' }}>{L('Gerenciar Pipelines', 'Manage Pipelines', 'Administrar Pipelines')}</h1>
        <Link href="/dashboard/pipeline" className="text-[13px] font-bold" style={{ color: 'var(--accent)' }}>
          {L('← Voltar ao Kanban', '← Back to Kanban', '← Volver al Kanban')}
        </Link>
      </div>

      {/* Create new pipeline */}
      <div className="rounded-xl p-4 mb-6 flex gap-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder={L('Nome do pipeline...', 'Pipeline name...', 'Nombre del pipeline...')}
          className="flex-1 px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid var(--border)' }}
          onKeyDown={e => e.key === 'Enter' && createPipeline()} />
        <button onClick={createPipeline} className="px-4 py-2 rounded-lg text-[13px] font-bold text-white" style={{ background: 'var(--accent)' }}>
          {L('Criar Pipeline', 'Create Pipeline', 'Crear Pipeline')}
        </button>
      </div>

      {/* Pipeline list — clicar pra abrir, ✏️ pra renomear, ‹ › pra reordenar */}
      <div className="flex gap-2 mb-2 flex-wrap items-center">
        {pipelines.map((p, idx) => {
          const isSel = selected?.id === p.id
          const ico = isSel ? 'rgba(139,92,246,0.35)' : '#94a3b8'
          return (
            <div key={p.id} className="flex items-center rounded-xl pl-0.5 pr-1 py-0.5"
              style={{ background: isSel ? 'var(--accent)' : 'var(--bg-card)', border: `1px solid ${isSel ? 'var(--accent)' : 'var(--border)'}` }}>
              <button onClick={() => movePipeline(idx, -1)} disabled={idx === 0} title={L('Mover pra esquerda', 'Move left', 'Mover a la izquierda')}
                className="w-5 h-7 rounded flex items-center justify-center text-[15px] leading-none disabled:opacity-20"
                style={{ color: ico }}>‹</button>

              {editingPipelineId === p.id ? (
                <input autoFocus value={editPipelineName}
                  onChange={e => setEditPipelineName(e.target.value)}
                  onBlur={saveRenamePipeline}
                  onKeyDown={e => { if (e.key === 'Enter') saveRenamePipeline(); if (e.key === 'Escape') setEditingPipelineId(null) }}
                  className="px-2 py-1 rounded-lg text-[13px] font-bold w-36"
                  style={{ border: '1px solid rgba(139,92,246,0.35)', color: 'var(--fg)' }} />
              ) : (
                <button onClick={() => setSelected(p)} onDoubleClick={() => startRenamePipeline(p)}
                  title={L('Clicar pra abrir · 2 cliques pra renomear', 'Click to open · double-click to rename', 'Clic para abrir · doble clic para renombrar')}
                  className="px-2 py-1 text-[13px] font-bold whitespace-nowrap"
                  style={{ color: isSel ? '#fff' : 'var(--fg-secondary)' }}>
                  {p.name} {p.is_default && '★'}
                </button>
              )}

              <button onClick={() => startRenamePipeline(p)} title={L('Renomear', 'Rename', 'Renombrar')}
                className="w-6 h-7 rounded flex items-center justify-center text-[12px] leading-none opacity-80 hover:opacity-100">✏️</button>
              <button onClick={() => movePipeline(idx, 1)} disabled={idx === pipelines.length - 1} title={L('Mover pra direita', 'Move right', 'Mover a la derecha')}
                className="w-5 h-7 rounded flex items-center justify-center text-[15px] leading-none disabled:opacity-20"
                style={{ color: ico }}>›</button>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] mb-6" style={{ color: 'var(--fg-muted)' }}>
        {L(
          'Clique pra abrir · ✏️ (ou 2 cliques no nome) pra renomear · ‹ › pra mudar a ordem',
          'Click to open · ✏️ (or double-click the name) to rename · ‹ › to change the order',
          'Clic para abrir · ✏️ (o doble clic en el nombre) para renombrar · ‹ › para cambiar el orden',
        )}
      </p>

      {/* Selected pipeline stages */}
      {selected && (
        <div className="rounded-2xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-bold" style={{ color: 'var(--fg)' }}>{L('Estagios:', 'Stages:', 'Etapas:')} {selected.name}</h2>
            <button onClick={() => deletePipeline(selected.id)} className="text-[11px] font-bold px-3 py-1 rounded-lg" style={{ color: '#ef4444', background: 'var(--err-soft)' }}>
              {L('Deletar Pipeline', 'Delete Pipeline', 'Eliminar Pipeline')}
            </button>
          </div>

          <div className="space-y-2 mb-4">
            {selected.stages.map((stage, idx) => (
              <div key={stage.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--bg)' }}>
                <input type="color" value={stage.color} onChange={e => updateStage(idx, 'color', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0" />
                <input type="text" value={stage.name} onChange={e => updateStage(idx, 'name', e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-[13px] font-semibold" style={{ border: '1px solid var(--border)' }} />
                <div className="flex gap-1">
                  <button onClick={() => moveStage(idx, -1)} disabled={idx === 0}
                    className="w-7 h-7 rounded flex items-center justify-center text-[12px] disabled:opacity-20" style={{ background: 'var(--border)' }}>↑</button>
                  <button onClick={() => moveStage(idx, 1)} disabled={idx === selected.stages.length - 1}
                    className="w-7 h-7 rounded flex items-center justify-center text-[12px] disabled:opacity-20" style={{ background: 'var(--border)' }}>↓</button>
                </div>
                <span className="text-[11px] font-mono" style={{ color: 'var(--fg-muted)' }}>#{idx + 1}</span>
                <button onClick={() => deleteStage(stage.id)}
                  title={L('Deletar estágio', 'Delete stage', 'Eliminar etapa')}
                  className="w-7 h-7 rounded flex items-center justify-center text-[12px] transition-all hover:bg-red-50"
                  style={{ background: 'var(--err-soft)', color: '#ef4444' }}>
                  🗑
                </button>
              </div>
            ))}
          </div>

          {/* Add stage */}
          <div className="flex gap-2 mb-4">
            <input type="text" value={newStageName} onChange={e => setNewStageName(e.target.value)} placeholder={L('Novo estagio...', 'New stage...', 'Nueva etapa...')}
              className="flex-1 px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid var(--border)' }}
              onKeyDown={e => e.key === 'Enter' && addStage()} />
            <button onClick={addStage} className="px-4 py-2 rounded-lg text-[12px] font-bold" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
              {L('+ Adicionar', '+ Add', '+ Agregar')}
            </button>
          </div>

          <button onClick={saveStages} disabled={saving}
            className="w-full py-3 rounded-xl text-[14px] font-bold text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}>
            {saving ? L('Salvando...', 'Saving...', 'Guardando...') : L('Salvar Alteracoes', 'Save Changes', 'Guardar Cambios')}
          </button>
        </div>
      )}
    </div>
  )
}
