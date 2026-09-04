'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { getInitials } from '@/lib/utils'
import { removeTeamMember, teamRemovalError } from '@/lib/team-removal-client'

interface Member { id?: string; name: string; email?: string | null; phone?: string | null; whatsapp?: string | null; is_active?: boolean; leads_count?: number }

function avatarBg(name: string) {
  const h = ((name?.charCodeAt(0) || 65) * 37) % 360
  return `linear-gradient(135deg, hsl(${h}, 62%, 52%), hsl(${(h + 40) % 360}, 62%, 46%))`
}

export default function MobileTime() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const router = useRouter()

  const [buyerId, setBuyerId] = useState<string | null>(null)
  const [list, setList] = useState<Member[] | null>(null)
  const [editing, setEditing] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removalFeedback, setRemovalFeedback] = useState<{ error: boolean; text: string } | null>(null)

  const reload = (bid: string) => fetch(`/api/team/members?buyer_id=${bid}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setList(d.members || []) }).catch(() => {})

  useEffect(() => {
    fetch('/api/m/team-context', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d?.buyer_id) { setBuyerId(d.buyer_id); reload(d.buyer_id) } else setList([]) }).catch(() => setList([]))
  }, [])

  async function save() {
    if (!editing || busy || !editing.name.trim() || !buyerId) return
    setBusy(true)
    try {
      if (editing.id) await fetch(`/api/team/members/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editing.name, email: editing.email || null, phone: editing.phone || null, whatsapp: editing.whatsapp || null }) })
      else await fetch('/api/team/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buyer_id: buyerId, name: editing.name, email: editing.email, phone: editing.phone, whatsapp: editing.whatsapp }) })
      await reload(buyerId)
      setEditing(null)
    } catch {}
    setBusy(false)
  }

  async function toggleActive(m: Member) {
    if (!m.id || !buyerId) return
    setList(prev => (prev || []).map(x => x.id === m.id ? { ...x, is_active: !x.is_active } : x))
    try { await fetch(`/api/team/members/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !m.is_active }) }) } catch {}
  }

  async function remove(m: Member) {
    if (!m.id || !buyerId || removingId) return
    if (!confirm(L(`Remover ${m.name.trim()} do time? Os leads permanecem com o responsável pelo time. Leads arquivados continuam arquivados. A conta do agente não será excluída.`, `Remove ${m.name.trim()} from the team? Leads stay with the team owner. Archived leads remain archived. The agent's account will not be deleted.`, `¿Eliminar a ${m.name.trim()} del equipo? Los leads quedan con el responsable del equipo. Los archivados siguen archivados. La cuenta del agente no se eliminará.`))) return
    setRemovingId(m.id)
    setRemovalFeedback(null)
    try {
      await removeTeamMember(m.id)
      setList(previous => (previous || []).filter(member => member.id !== m.id))
      setRemovalFeedback({ error: false, text: L('Agente removido do time. Leads e histórico preservados.', 'Agent removed from the team. Leads and history preserved.', 'Agente eliminado del equipo. Leads e historial conservados.') })
    } catch (error) {
      setRemovalFeedback({ error: true, text: teamRemovalError(error instanceof Error ? error.message : 'REMOVE_FAILED', loc) })
    } finally { setRemovingId(null) }
  }

  const total = list?.length || 0
  const active = (list || []).filter(m => m.is_active).length
  const distributed = (list || []).reduce((s, m) => s + (m.leads_count || 0), 0)

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 6, display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
        <button onClick={() => router.push('/m/mais')} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="arrowLeft" size={24} /></button>
        <p style={{ margin: 0, flex: 1, fontSize: 20, fontWeight: 800 }}>{L('Meu time', 'My team', 'Mi equipo')}</p>
        <button onClick={() => setEditing({ name: '', email: '', phone: '', whatsapp: '' })} className="m-tap" style={{ background: 'none', border: 'none', color: '#a5b4fc', display: 'flex', cursor: 'pointer', padding: 0 }}><MIcon name="userPlus" size={23} /></button>
      </div>

      <div className="m-pad" style={{ paddingTop: 6 }}>
        {removalFeedback && <p role={removalFeedback.error ? 'alert' : 'status'} className="m-card" style={{ padding: 12, color: removalFeedback.error ? '#f87171' : '#34d399', fontSize: 13 }}>{removalFeedback.text}</p>}
        {!list && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="m-spin" /></div>}

        {list && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
              {[[total, L('Membros', 'Members', 'Miembros')], [active, L('Ativos', 'Active', 'Activos')], [distributed, L('Leads', 'Leads', 'Leads')]].map(([v, lbl], i) => (
                <div key={i} className="m-card" style={{ padding: '13px 10px', textAlign: 'center' }}><p style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{v}</p><p className="m-muted" style={{ margin: '2px 0 0', fontSize: 11 }}>{lbl}</p></div>
              ))}
            </div>

            {list.length === 0 && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 20, fontSize: 14 }}>{L('Sem membros ainda. Toque em + pra adicionar.', 'No members yet. Tap + to add.', 'Sin miembros.')}</p>}

            {list.map(m => (
              <div key={m.id} className="m-card" style={{ padding: 13, marginBottom: 11, opacity: m.is_active ? 1 : 0.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 11 }}>
                  <div className="m-av" style={{ width: 44, height: 44, fontSize: 14, background: avatarBg(m.name) }}>{getInitials(m.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{m.name}</p>
                    <p className="m-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>{m.phone || m.email || L('sem contato', 'no contact', 'sin contacto')} · {m.leads_count || 0} leads</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditing(m)} className="m-tap" style={{ flex: 1, height: 36, borderRadius: 10, background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{L('Editar', 'Edit', 'Editar')}</button>
                  <button onClick={() => toggleActive(m)} className="m-tap" style={{ flex: 1, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--m-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{m.is_active ? L('Pausar', 'Pause', 'Pausar') : L('Ativar', 'Activate', 'Activar')}</button>
                  <button onClick={() => remove(m)} disabled={removingId !== null} aria-busy={removingId === m.id} aria-label={L('Remover', 'Remove', 'Eliminar')} className="m-tap" style={{ width: 42, height: 36, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: removingId ? 0.5 : 1 }}>{removingId === m.id ? '…' : <MIcon name="x" size={15} />}</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {editing && (
        <div className="m-sheet-ov" onClick={() => setEditing(null)}>
          <div className="m-sheet" onClick={e => e.stopPropagation()} style={{ padding: '8px 20px calc(env(safe-area-inset-bottom) + 18px)' }}>
            <div className="m-sheet-grab" style={{ marginLeft: 'auto', marginRight: 'auto' }} />
            <p style={{ margin: '2px 0 14px', fontSize: 15, fontWeight: 700 }}>{editing.id ? L('Editar membro', 'Edit member', 'Editar') : L('Adicionar membro', 'Add member', 'Añadir')}</p>
            <input className="m-input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder={L('Nome *', 'Name *', 'Nombre *')} style={{ marginBottom: 11 }} />
            <input className="m-input" value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} placeholder={L('E-mail', 'Email', 'Correo electrónico')} style={{ marginBottom: 11 }} />
            <input className="m-input" value={editing.phone || ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} placeholder={L('Telefone', 'Phone', 'Teléfono')} style={{ marginBottom: 11 }} />
            <input className="m-input" value={editing.whatsapp || ''} onChange={e => setEditing({ ...editing, whatsapp: e.target.value })} placeholder="WhatsApp" style={{ marginBottom: 16 }} />
            <button onClick={save} disabled={busy || !editing.name.trim()} className="m-tap" style={{ width: '100%', height: 48, borderRadius: 14, background: 'var(--m-grad)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: busy || !editing.name.trim() ? 0.5 : 1 }}>{busy ? L('Salvando…', 'Saving…', 'Guardando…') : L('Salvar', 'Save', 'Guardar')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
