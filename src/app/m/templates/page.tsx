'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'

interface Template { id?: string; buyer_id?: string | null; name: string; type: 'whatsapp' | 'email'; subject?: string | null; body: string; is_system?: boolean }
const VARS = ['{nome}', '{primeiro_nome}', '{telefone}', '{email}', '{estado}', '{cidade}', '{interesse}', '{agente}']

export default function MobileTemplates() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const router = useRouter()

  const [buyerId, setBuyerId] = useState<string | null>(null)
  const [list, setList] = useState<Template[] | null>(null)
  const [editing, setEditing] = useState<Template | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = (bid: string) => fetch(`/api/templates?buyer_id=${bid}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setList(d.templates || []) }).catch(() => {})

  useEffect(() => {
    fetch('/api/m/team-context', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d?.buyer_id) { setBuyerId(d.buyer_id); reload(d.buyer_id) } else setList([]) }).catch(() => setList([]))
  }, [])

  async function save() {
    if (!editing || busy || !editing.name.trim() || !editing.body.trim()) return
    setBusy(true)
    try {
      if (editing.id) {
        await fetch(`/api/templates/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editing.name, subject: editing.subject, body: editing.body, type: editing.type }) })
      } else {
        await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buyer_id: buyerId, name: editing.name, type: editing.type, subject: editing.subject, body: editing.body }) })
      }
      if (buyerId) await reload(buyerId)
      setEditing(null)
    } catch {}
    setBusy(false)
  }

  async function del(tp: Template) {
    if (!tp.id || !confirm(L('Excluir este modelo?', 'Delete this template?', '¿Eliminar esta plantilla?'))) return
    try { await fetch(`/api/templates/${tp.id}`, { method: 'DELETE' }); if (buyerId) reload(buyerId) } catch {}
  }

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 6, display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
        <button onClick={() => router.push('/m/mais')} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="arrowLeft" size={24} /></button>
        <p style={{ margin: 0, flex: 1, fontSize: 20, fontWeight: 800 }}>{t.sidebar.templates}</p>
        <button onClick={() => setEditing({ name: '', type: 'whatsapp', subject: '', body: '' })} className="m-tap" style={{ background: 'none', border: 'none', color: '#a5b4fc', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="plus" size={24} /></button>
      </div>

      <div className="m-pad" style={{ paddingTop: 6 }}>
        {!list && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="m-spin" /></div>}
        {list && list.length === 0 && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40, fontSize: 14 }}>{L('Nenhum modelo. Toque em + para criar.', 'No templates. Tap + to create.', 'No hay plantillas. Toca + para crear una.')}</p>}

        {(list || []).map(tp => (
          <div key={tp.id} className="m-card" style={{ padding: 14, marginBottom: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 }}>
              <span style={{ color: tp.type === 'email' ? '#a5b4fc' : '#34d399', display: 'flex' }}><MIcon name={tp.type === 'email' ? 'message' : 'whatsapp'} size={18} /></span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tp.name}</span>
              {tp.is_system && <span className="m-chip" style={{ padding: '3px 9px', fontSize: 10 }}>{L('Sistema', 'System', 'Sistema')}</span>}
            </div>
            <p className="m-muted" style={{ margin: '0 0 11px', fontSize: 13, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{tp.body}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {tp.is_system
                ? <button onClick={() => setEditing({ name: `${tp.name} ${L('(cópia)', '(copy)', '(copia)')}`, type: tp.type, subject: tp.subject, body: tp.body })} className="m-tap" style={{ flex: 1, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--m-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{L('Duplicar', 'Duplicate', 'Duplicar')}</button>
                : <>
                  <button onClick={() => setEditing(tp)} className="m-tap" style={{ flex: 1, height: 38, borderRadius: 10, background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{L('Editar', 'Edit', 'Editar')}</button>
                  <button onClick={() => del(tp)} className="m-tap" style={{ width: 44, height: 38, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><MIcon name="x" size={16} /></button>
                </>}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="m-sheet-ov" onClick={() => setEditing(null)}>
          <div className="m-sheet" onClick={e => e.stopPropagation()} style={{ padding: '8px 20px calc(env(safe-area-inset-bottom) + 18px)' }}>
            <div className="m-sheet-grab" style={{ marginLeft: 'auto', marginRight: 'auto' }} />
            <p style={{ margin: '2px 0 12px', fontSize: 15, fontWeight: 700 }}>{editing.id ? L('Editar modelo', 'Edit template', 'Editar plantilla') : L('Novo modelo', 'New template', 'Nueva plantilla')}</p>
            <input className="m-input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder={L('Nome', 'Name', 'Nombre')} style={{ marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <span className={`m-chip m-tap${editing.type === 'whatsapp' ? ' on' : ''}`} onClick={() => setEditing({ ...editing, type: 'whatsapp' })}>WhatsApp</span>
              <span className={`m-chip m-tap${editing.type === 'email' ? ' on' : ''}`} onClick={() => setEditing({ ...editing, type: 'email' })}>Email</span>
            </div>
            {editing.type === 'email' && <input className="m-input" value={editing.subject || ''} onChange={e => setEditing({ ...editing, subject: e.target.value })} placeholder={L('Assunto', 'Subject', 'Asunto')} style={{ marginBottom: 12 }} />}
            <textarea value={editing.body} onChange={e => setEditing({ ...editing, body: e.target.value })} placeholder={L('Mensagem…', 'Message…', 'Mensaje…')} rows={4} style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--m-text)', borderRadius: 13, padding: '11px 14px', fontSize: 14, outline: 'none', resize: 'none', marginBottom: 10, fontFamily: 'inherit' }} />
            <p className="m-muted" style={{ fontSize: 12, fontWeight: 600, margin: '0 0 8px' }}>{L('Variáveis (toque pra inserir)', 'Variables (tap to insert)', 'Variables')}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
              {VARS.map(v => <span key={v} className="m-chip m-tap" onClick={() => setEditing(e => e ? { ...e, body: (e.body + ' ' + v).trim() } : e)}>{v}</span>)}
            </div>
            <button onClick={save} disabled={busy || !editing.name.trim() || !editing.body.trim()} className="m-tap" style={{ width: '100%', height: 48, borderRadius: 14, background: 'var(--m-grad)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: busy || !editing.name.trim() || !editing.body.trim() ? 0.5 : 1 }}>{busy ? L('Salvando…', 'Saving…', 'Guardando…') : L('Salvar', 'Save', 'Guardar')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
