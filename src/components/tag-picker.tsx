'use client'

import { useState, useEffect } from 'react'

interface Tag {
  id: string
  name: string
  color: string
}

interface Props {
  leadId: string
  buyerId: string
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#64748b']

export function TagPicker({ leadId, buyerId }: Props) {
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [leadTags, setLeadTags] = useState<Tag[]>([])
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(COLORS[0])

  useEffect(() => { reload() }, [leadId, buyerId])

  async function reload() {
    const [tagsRes, leadTagsRes] = await Promise.all([
      fetch(`/api/tags?buyer_id=${buyerId}`).then(r => r.json()),
      fetch(`/api/leads/${leadId}/tags`).then(r => r.json()),
    ])
    setAllTags(tagsRes.tags || [])
    setLeadTags(leadTagsRes.tags || [])
  }

  async function attach(tagId: string) {
    await fetch(`/api/leads/${leadId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tagId }),
    })
    await reload()
  }

  async function detach(tagId: string) {
    await fetch(`/api/leads/${leadId}/tags?tag_id=${tagId}`, { method: 'DELETE' })
    await reload()
  }

  async function createTag() {
    if (!newName.trim()) return
    const r = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyer_id: buyerId, name: newName.trim(), color: newColor }),
    })
    if (r.ok) {
      const { tag } = await r.json()
      await attach(tag.id)
      setNewName('')
      setCreating(false)
    }
  }

  const leadTagIds = new Set(leadTags.map(t => t.id))
  const availableTags = allTags.filter(t => !leadTagIds.has(t.id))

  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {leadTags.map(t => (
          <span key={t.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: t.color + '22', color: t.color, border: `1px solid ${t.color}44` }}>
            {t.name}
            <button onClick={() => detach(t.id)} className="hover:opacity-60" style={{ color: t.color }}>×</button>
          </span>
        ))}
        <button onClick={() => setPicking(!picking)}
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: '#f1f5f9', color: '#64748b', border: '1px dashed #cbd5e1' }}>
          + Tag
        </button>
      </div>

      {picking && (
        <div className="mt-2 p-3 rounded-lg" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
          {availableTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {availableTags.map(t => (
                <button key={t.id} onClick={() => attach(t.id)}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold hover:opacity-80"
                  style={{ background: t.color + '22', color: t.color, border: `1px solid ${t.color}44` }}>
                  + {t.name}
                </button>
              ))}
            </div>
          )}
          {!creating ? (
            <button onClick={() => setCreating(true)} className="text-[11px] font-bold" style={{ color: '#6366f1' }}>
              + Criar nova tag
            </button>
          ) : (
            <div className="flex gap-2 items-center">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Nome da tag" autoFocus
                className="flex-1 px-2 py-1 rounded text-[11px]"
                style={{ background: '#fff', border: '1px solid #e8ecf4' }} />
              <div className="flex gap-0.5">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setNewColor(c)}
                    className="w-5 h-5 rounded-full"
                    style={{ background: c, border: newColor === c ? '2px solid #1a1a2e' : 'none' }} />
                ))}
              </div>
              <button onClick={createTag} className="px-2 py-1 rounded text-[11px] font-bold text-white"
                style={{ background: '#6366f1' }}>
                Criar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
