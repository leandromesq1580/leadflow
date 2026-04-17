'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Stage { id: string; name: string; color: string; position: number }
interface Pipeline { id: string; name: string; is_default: boolean; stages: Stage[] }

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#f97316', '#059669', '#ef4444', '#ec4899', '#06b6d4', '#84cc16']

export default function PipelineSettingsPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selected, setSelected] = useState<Pipeline | null>(null)
  const [buyerId, setBuyerId] = useState('')
  const [newName, setNewName] = useState('')
  const [newStageName, setNewStageName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    if (cookie) {
      try {
        const token = JSON.parse(atob(cookie.split('=')[1]))
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
    setPipelines(d.pipelines || [])
    if (d.pipelines?.length > 0 && !selected) setSelected(d.pipelines[0])
  }

  async function createPipeline() {
    if (!newName.trim()) return
    await fetch('/api/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyer_id: buyerId, name: newName }),
    })
    setNewName('')
    loadPipelines(buyerId)
  }

  async function deletePipeline(id: string) {
    if (!confirm('Deletar este pipeline?')) return
    const r = await fetch(`/api/pipelines/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const d = await r.json()
      alert(d.error || 'Erro ao deletar pipeline')
      return
    }
    setSelected(null)
    loadPipelines(buyerId)
  }

  async function deleteStage(stageId: string) {
    if (!selected) return
    if (!confirm('Deletar este estágio?')) return
    const r = await fetch(`/api/pipelines/${selected.id}/stages/${stageId}`, { method: 'DELETE' })
    if (!r.ok) {
      const d = await r.json()
      alert(d.error || 'Erro ao deletar estágio')
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
        <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Gerenciar Pipelines</h1>
        <Link href="/dashboard/pipeline" className="text-[13px] font-bold" style={{ color: '#6366f1' }}>
          ← Voltar ao Kanban
        </Link>
      </div>

      {/* Create new pipeline */}
      <div className="rounded-xl p-4 mb-6 flex gap-3" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do pipeline..."
          className="flex-1 px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }}
          onKeyDown={e => e.key === 'Enter' && createPipeline()} />
        <button onClick={createPipeline} className="px-4 py-2 rounded-lg text-[13px] font-bold text-white" style={{ background: '#6366f1' }}>
          Criar Pipeline
        </button>
      </div>

      {/* Pipeline list */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {pipelines.map(p => (
          <button key={p.id} onClick={() => setSelected(p)}
            className="px-4 py-2 rounded-xl text-[13px] font-bold"
            style={{
              background: selected?.id === p.id ? '#6366f1' : '#fff',
              color: selected?.id === p.id ? '#fff' : '#64748b',
              border: `1px solid ${selected?.id === p.id ? '#6366f1' : '#e8ecf4'}`,
            }}>
            {p.name} {p.is_default && '★'}
          </button>
        ))}
      </div>

      {/* Selected pipeline stages */}
      {selected && (
        <div className="rounded-2xl p-6" style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-bold" style={{ color: '#1a1a2e' }}>Estagios: {selected.name}</h2>
            <button onClick={() => deletePipeline(selected.id)} className="text-[11px] font-bold px-3 py-1 rounded-lg" style={{ color: '#ef4444', background: '#fef2f2' }}>
              Deletar Pipeline
            </button>
          </div>

          <div className="space-y-2 mb-4">
            {selected.stages.map((stage, idx) => (
              <div key={stage.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#f8f9fc' }}>
                <input type="color" value={stage.color} onChange={e => updateStage(idx, 'color', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0" />
                <input type="text" value={stage.name} onChange={e => updateStage(idx, 'name', e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-[13px] font-semibold" style={{ border: '1px solid #e8ecf4' }} />
                <div className="flex gap-1">
                  <button onClick={() => moveStage(idx, -1)} disabled={idx === 0}
                    className="w-7 h-7 rounded flex items-center justify-center text-[12px] disabled:opacity-20" style={{ background: '#e8ecf4' }}>↑</button>
                  <button onClick={() => moveStage(idx, 1)} disabled={idx === selected.stages.length - 1}
                    className="w-7 h-7 rounded flex items-center justify-center text-[12px] disabled:opacity-20" style={{ background: '#e8ecf4' }}>↓</button>
                </div>
                <span className="text-[11px] font-mono" style={{ color: '#94a3b8' }}>#{idx + 1}</span>
                <button onClick={() => deleteStage(stage.id)}
                  title="Deletar estágio"
                  className="w-7 h-7 rounded flex items-center justify-center text-[12px] transition-all hover:bg-red-50"
                  style={{ background: '#fef2f2', color: '#ef4444' }}>
                  🗑
                </button>
              </div>
            ))}
          </div>

          {/* Add stage */}
          <div className="flex gap-2 mb-4">
            <input type="text" value={newStageName} onChange={e => setNewStageName(e.target.value)} placeholder="Novo estagio..."
              className="flex-1 px-3 py-2 rounded-lg text-[13px]" style={{ border: '1px solid #e8ecf4' }}
              onKeyDown={e => e.key === 'Enter' && addStage()} />
            <button onClick={addStage} className="px-4 py-2 rounded-lg text-[12px] font-bold" style={{ background: '#eef2ff', color: '#6366f1' }}>
              + Adicionar
            </button>
          </div>

          <button onClick={saveStages} disabled={saving}
            className="w-full py-3 rounded-xl text-[14px] font-bold text-white disabled:opacity-50"
            style={{ background: '#6366f1' }}>
            {saving ? 'Salvando...' : 'Salvar Alteracoes'}
          </button>
        </div>
      )}
    </div>
  )
}
