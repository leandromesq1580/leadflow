'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { AssignSheet } from '@/components/mobile/assign-sheet'
import { NewLeadSheet } from '@/components/mobile/new-lead-sheet'
import { timeAgo, getInitials, statusLabel } from '@/lib/utils'

interface Lead { id: string; name: string; phone: string; city: string; state: string; status: string; interest: string; type: string; created_at: string; assigned_to_member?: string | null }
interface Member { id: string; name: string }

// Quantos leads por página. Antes o app pedia limit=100 fixo e sem offset —
// quem tinha mais de 100 leads simplesmente não enxergava os antigos no celular.
const PAGE = 100

function avatarBg(name: string) {
  const h = ((name?.charCodeAt(0) || 65) * 37) % 360
  return `linear-gradient(135deg, hsl(${h}, 62%, 52%), hsl(${(h + 40) % 360}, 62%, 46%))`
}

export default function MobileLeads() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)

  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [err, setErr] = useState(false)
  const [filter, setFilter] = useState<'all' | 'new' | 'hot' | 'sched'>('all')
  const [q, setQ] = useState('')
  const [isAgency, setIsAgency] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [sheetLead, setSheetLead] = useState<Lead | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/leads?limit=${PAGE}&offset=0`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { setLeads(d.leads || []); setTotal(typeof d.total === 'number' ? d.total : null) })
      .catch(() => setErr(true))
    fetch('/api/m/team-context', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setIsAgency(!!d.is_agency); setMembers(d.members || []) } })
      .catch(() => {})
  }, [])

  const loaded = leads?.length || 0
  const hasMore = total !== null && loaded < total

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const r = await fetch(`/api/leads?limit=${PAGE}&offset=${loaded}`, { cache: 'no-store' })
      const d = await r.json()
      // dedup por id: o append pode repetir se um lead novo entrar entre as páginas
      setLeads(prev => {
        const seen = new Set((prev || []).map(l => l.id))
        return [...(prev || []), ...((d.leads || []) as Lead[]).filter(l => !seen.has(l.id))]
      })
      if (typeof d.total === 'number') setTotal(d.total)
    } catch {}
    setLoadingMore(false)
  }, [loadingMore, hasMore, loaded])

  const memberName = (id?: string | null) => members.find(m => m.id === id)?.name || null
  const canAssign = isAgency && members.length > 0

  const chips: { key: typeof filter; label: string }[] = [
    { key: 'all', label: L('Todos', 'All', 'Todos') },
    { key: 'new', label: L('Novos', 'New', 'Nuevos') },
    { key: 'hot', label: L('Quentes', 'Hot', 'Calientes') },
    { key: 'sched', label: L('Agendados', 'Scheduled', 'Agendados') },
  ]

  const shown = useMemo(() => {
    let list = leads || []
    if (filter === 'new') list = list.filter(l => l.status === 'assigned')
    else if (filter === 'hot') list = list.filter(l => l.type === 'hot')
    else if (filter === 'sched') list = list.filter(l => ['meeting_set', 'appointment_set', 'scheduled', 'confirmed'].includes(l.status))
    const term = q.trim().toLowerCase()
    if (term) list = list.filter(l => (l.name || '').toLowerCase().includes(term) || (l.phone || '').includes(term) || (l.city || '').toLowerCase().includes(term))
    return list
  }, [leads, filter, q])

  function onAssigned(memberId: string | null) {
    if (!sheetLead) return
    setLeads(prev => (prev || []).map(l => l.id === sheetLead.id ? { ...l, assigned_to_member: memberId } : l))
  }

  function onCreated(lead: Lead) {
    setLeads(prev => [lead, ...(prev || [])])
    setTotal(t => (t === null ? t : t + 1))
  }

  return (
    <div>
      <div className="m-pad" style={{ paddingTop: 8, paddingBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 14px' }}>
          <p style={{ margin: 0, flex: 1, fontSize: 20, fontWeight: 800 }}>{L('Meus leads', 'My leads', 'Mis leads')}</p>
          {/* "+" no cabeçalho (mesmo padrão da agenda) — cadastrar lead na hora.
              Header em vez de FAB pra não colidir com o botão flutuante da Zoe. */}
          <button onClick={() => setNewOpen(true)} aria-label={L('Novo lead', 'New lead', 'Nuevo lead')} className="m-tap"
            style={{ width: 38, height: 38, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--m-grad)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 6px 16px -6px rgba(99,102,241,0.7)' }}>
            <MIcon name="plus" size={22} />
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--m-faint)', display: 'flex' }}><MIcon name="search" size={18} /></span>
          <input className="m-input" value={q} onChange={e => setQ(e.target.value)} placeholder={L('Buscar lead...', 'Search lead...', 'Buscar lead...')} style={{ paddingLeft: 40 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 13, overflowX: 'auto' }}>
          {chips.map(c => (
            <span key={c.key} className={`m-chip m-tap${filter === c.key ? ' on' : ''}`} onClick={() => setFilter(c.key)}>{c.label}</span>
          ))}
        </div>
      </div>

      <div className="m-pad">
        {!leads && !err && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="m-spin" /></div>}
        {err && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40 }}>Não consegui carregar agora.</p>}
        {leads && shown.length === 0 && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40, fontSize: 14 }}>{L('Nenhum lead aqui.', 'No leads here.', 'Sin leads aquí.')}</p>}

        {shown.map(l => {
          const mName = memberName(l.assigned_to_member)
          return (
            <div key={l.id} className="m-card" style={{ padding: 12, marginBottom: 11, display: 'flex', alignItems: 'center', gap: 11 }}>
              <Link href={`/m/leads/${l.id}`} className="m-link" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 11 }}>
                <div className="m-av" style={{ width: 44, height: 44, fontSize: 14, background: avatarBg(l.name) }}>{getInitials(l.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</p>
                  <p className="m-muted" style={{ margin: '2px 0 0', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[[l.city, l.state].filter(Boolean).join(', '), statusLabel(l.status), timeAgo(l.created_at)].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </Link>
              {canAssign && (
                <button className={`m-assign m-tap ${mName ? 'has' : 'none'}`} onClick={() => setSheetLead(l)}>
                  {mName
                    ? <span style={{ maxWidth: 78, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mName}</span>
                    : <><MIcon name="userPlus" size={14} />{L('Atribuir', 'Assign', 'Asignar')}</>}
                </button>
              )}
            </div>
          )
        })}

        {/* Busca/filtro rodam sobre o que já foi carregado — avisa quando ainda há leads no servidor */}
        {leads && hasMore && (q.trim() || filter !== 'all') && (
          <p className="m-faint" style={{ textAlign: 'center', fontSize: 11.5, margin: '2px 0 12px', lineHeight: 1.5 }}>
            {L(`Buscando entre ${loaded} de ${total} leads. Carregue mais pra incluir os antigos.`,
               `Searching ${loaded} of ${total} leads. Load more to include older ones.`,
               `Buscando entre ${loaded} de ${total} leads.`)}
          </p>
        )}

        {leads && hasMore && (
          <button onClick={loadMore} disabled={loadingMore} className="m-tap"
            style={{ width: '100%', height: 46, marginBottom: 10, borderRadius: 13, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--m-border)', color: 'var(--m-text)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: loadingMore ? 0.6 : 1 }}>
            {loadingMore
              ? L('Carregando…', 'Loading…', 'Cargando…')
              : L(`Carregar mais (${loaded} de ${total})`, `Load more (${loaded} of ${total})`, `Cargar más (${loaded} de ${total})`)}
          </button>
        )}

        {leads && !hasMore && total !== null && total > PAGE && (
          <p className="m-faint" style={{ textAlign: 'center', fontSize: 11.5, margin: '2px 0 10px' }}>
            {L(`Todos os ${total} leads carregados.`, `All ${total} leads loaded.`, `Los ${total} leads cargados.`)}
          </p>
        )}
      </div>

      {newOpen && (
        <NewLeadSheet locale={loc} onClose={() => setNewOpen(false)} onCreated={onCreated} />
      )}

      {sheetLead && (
        <AssignSheet
          leadId={sheetLead.id}
          leadName={sheetLead.name}
          members={members}
          currentMemberId={sheetLead.assigned_to_member}
          locale={loc}
          onClose={() => setSheetLead(null)}
          onDone={onAssigned}
        />
      )}
    </div>
  )
}
