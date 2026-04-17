'use client'

import { useState, useEffect } from 'react'
import { AVAILABLE_VARS } from '@/lib/template-render'

interface Template {
  id: string; buyer_id: string | null; name: string; type: 'whatsapp' | 'email'
  subject: string | null; body: string; is_system: boolean; created_at: string
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [buyerId, setBuyerId] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Template | null>(null)
  const [showNew, setShowNew] = useState(false)
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
    load(buyer.id)
  }

  async function load(bid: string) {
    setLoading(true)
    const r = await fetch(`/api/templates?buyer_id=${bid}`)
    const d = await r.json()
    setTemplates(d.templates || [])
    setLoading(false)
  }

  async function save(data: Partial<Template>) {
    setSaving(true)
    if (editing && !editing.is_system) {
      await fetch(`/api/templates/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } else {
      await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, buyer_id: buyerId }),
      })
    }
    setEditing(null)
    setShowNew(false)
    setSaving(false)
    load(buyerId)
  }

  async function remove(id: string) {
    if (!confirm('Deletar esse template?')) return
    await fetch(`/api/templates/${id}`, { method: 'DELETE' })
    load(buyerId)
  }

  if (loading) return <div className="py-20 text-center"><div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{ borderColor: '#6366f1' }} /></div>

  return (
    <div className="max-w-[900px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>Templates</h1>
          <p className="text-[14px] mt-1" style={{ color: '#64748b' }}>Mensagens prontas pra WhatsApp e Email</p>
        </div>
        <button onClick={() => { setEditing(null); setShowNew(true) }}
          className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-white"
          style={{ background: '#6366f1' }}>
          + Novo Template
        </button>
      </div>

      {(showNew || editing) && (
        <TemplateForm
          template={editing}
          onCancel={() => { setShowNew(false); setEditing(null) }}
          onSave={save}
          saving={saving}
        />
      )}

      <div className="space-y-3">
        {templates.map(t => (
          <div key={t.id} className="rounded-xl p-4 flex items-start gap-4"
            style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: t.type === 'whatsapp' ? '#dcfce7' : '#eef2ff' }}>
              <span className="text-[16px]">{t.type === 'whatsapp' ? '💬' : '📧'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>{t.name}</p>
                {t.is_system && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: '#fef3c7', color: '#92400e' }}>Sistema</span>}
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: t.type === 'whatsapp' ? '#dcfce7' : '#eef2ff', color: t.type === 'whatsapp' ? '#15803d' : '#4f46e5' }}>
                  {t.type}
                </span>
              </div>
              <p className="text-[12px] line-clamp-2" style={{ color: '#64748b' }}>{t.body}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {!t.is_system && (
                <>
                  <button onClick={() => { setEditing(t); setShowNew(false) }}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg"
                    style={{ background: '#eef2ff', color: '#6366f1' }}>
                    Editar
                  </button>
                  <button onClick={() => remove(t.id)}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg"
                    style={{ background: '#fef2f2', color: '#ef4444' }}>
                    ✕
                  </button>
                </>
              )}
              {t.is_system && (
                <button onClick={() => { setEditing({ ...t, is_system: false, id: '', buyer_id: buyerId }); setShowNew(true) }}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg"
                  style={{ background: '#eef2ff', color: '#6366f1' }}>
                  Duplicar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TemplateForm({ template, onCancel, onSave, saving }: {
  template: Template | null
  onCancel: () => void
  onSave: (data: Partial<Template>) => void
  saving: boolean
}) {
  const [name, setName] = useState(template?.name || '')
  const [type, setType] = useState<'whatsapp' | 'email'>(template?.type || 'whatsapp')
  const [subject, setSubject] = useState(template?.subject || '')
  const [body, setBody] = useState(template?.body || '')
  const [showVars, setShowVars] = useState(false)

  function insertVar(v: string) {
    setBody(b => b + ' ' + v)
  }

  return (
    <div className="rounded-2xl p-6 mb-6" style={{ background: '#fff', border: '2px solid #6366f1' }}>
      <h3 className="text-[16px] font-bold mb-4" style={{ color: '#1a1a2e' }}>{template ? 'Editar Template' : 'Novo Template'}</h3>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Nome</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Primeiro contato"
            className="w-full px-3 py-2 rounded-lg text-[13px]"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Tipo</label>
          <select value={type} onChange={e => setType(e.target.value as any)}
            className="w-full px-3 py-2 rounded-lg text-[13px] cursor-pointer"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }}>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </select>
        </div>
      </div>

      {type === 'email' && (
        <div className="mb-3">
          <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94a3b8' }}>Assunto</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex: Boas-vindas"
            className="w-full px-3 py-2 rounded-lg text-[13px]"
            style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
        </div>
      )}

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Mensagem</label>
          <button type="button" onClick={() => setShowVars(!showVars)}
            className="text-[11px] font-bold" style={{ color: '#6366f1' }}>
            {showVars ? '▼' : '▶'} Variáveis disponíveis
          </button>
        </div>
        {showVars && (
          <div className="mb-2 p-3 rounded-lg" style={{ background: '#f0f4ff', border: '1px solid #e0e7ff' }}>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_VARS.map(v => (
                <button key={v.key} type="button" onClick={() => insertVar(v.key)}
                  title={v.desc}
                  className="text-[11px] font-mono px-2 py-1 rounded hover:bg-white transition-colors"
                  style={{ background: '#fff', color: '#6366f1', border: '1px solid #c7d2fe' }}>
                  {v.key}
                </button>
              ))}
            </div>
          </div>
        )}
        <textarea value={body} onChange={e => setBody(e.target.value)}
          rows={6} placeholder="Oi {primeiro_nome}! Aqui eh {agente}..."
          className="w-full px-3 py-2 rounded-lg text-[13px] resize-none font-mono"
          style={{ background: '#f8f9fc', border: '1px solid #e8ecf4' }} />
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-[13px] font-semibold" style={{ color: '#94a3b8' }}>Cancelar</button>
        <button onClick={() => onSave({ name, type, subject: subject || null, body })} disabled={saving || !name || !body}
          className="px-5 py-2 rounded-lg text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: '#6366f1' }}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}
