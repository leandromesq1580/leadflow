'use client'

import { useEffect, useState, useCallback } from 'react'

type Kind = 'sacada' | 'win' | 'post' | 'poll'
type Channel = 'fechamento' | 'follow_up' | 'vitorias' | 'geral'

interface Post {
  id: string
  buyer_id: string | null
  author_name: string | null
  kind: Kind
  channel: Channel
  title: string | null
  body: string | null
  data: { sale_value?: number; lead_age_days?: number; product?: string; image_path?: string; poll?: { options: string[] } }
  pinned: boolean
  created_at: string
  reaction_count: number
  reactions?: Record<string, number>
  my_reactions?: string[]
  reacted: boolean
  comment_count: number
  poll_counts?: Record<string, number>
  my_poll_vote?: number | null
  can_delete: boolean
}
interface Me { id: string; name: string; isAdmin: boolean }
interface Comment { id: string; author_name: string | null; body: string; created_at: string; can_delete: boolean; buyer_id: string | null; parent_id?: string | null }
interface Notif { id: string; actor_name: string | null; type: string; post_id: string | null; preview: string | null; read: boolean; created_at: string }
interface Rank { buyer_id: string; name: string; count: number; total: number }

const CHANNEL_LABEL: Record<Channel, string> = { fechamento: 'Fechamento', follow_up: 'Follow-up', vitorias: 'Vitórias', geral: 'Geral' }
const REACTIONS: { kind: string; emoji: string }[] = [
  { kind: 'like', emoji: '👍' }, { kind: 'fire', emoji: '🔥' }, { kind: 'clap', emoji: '👏' }, { kind: 'party', emoji: '🎉' },
]

function initials(name?: string | null) {
  return (name || 'M').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}
function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'agora'
  if (s < 3600) return `${Math.floor(s / 60)}min`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 604800) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}
function money(n?: number) {
  if (!n) return ''
  return '$' + n.toLocaleString('en-US')
}
function sortFeed(list: Post[]) {
  return [...list].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
}
// Destaca @menções no texto (visual; a notificação é casada no servidor).
function renderBody(text: string, accent: string): React.ReactNode {
  return text.split(/(@[\p{L}\d._-]+)/gu).map((part, i) =>
    part.startsWith('@') ? <span key={i} style={{ color: accent, fontWeight: 600 }}>{part}</span> : part)
}

export function CommunityFeed({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const dark = theme === 'dark'
  const T = dark
    ? { card: '#16161f', border: '#262633', text: '#f5f5f7', muted: '#9aa0ac', accent: '#a78bfa', accentBg: '#241f3d', input: '#0f0f17', win: '#34d399', winBg: '#10261d', winText: '#6ee7b7', tag: '#20202c', chip: '#16161f' }
    : { card: '#ffffff', border: '#e8ecf4', text: '#1a1a2e', muted: '#64748b', accent: '#6366f1', accentBg: '#eef2ff', input: '#ffffff', win: '#059669', winBg: '#ecfdf5', winText: '#047857', tag: '#f1f5f9', chip: '#ffffff' }
  const bodyColor = dark ? '#d6d8de' : '#334155'

  const [me, setMe] = useState<Me | null>(null)
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [posts, setPosts] = useState<Post[]>([])
  const [channel, setChannel] = useState<'' | Channel>('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [sort, setSort] = useState<'recent' | 'top'>('recent')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  // composer
  const [open, setOpen] = useState(false)
  const [ckind, setCkind] = useState<Kind>('post')
  const [cchannel, setCchannel] = useState<Channel>('geral')
  const [cbody, setCbody] = useState('')
  const [csale, setCsale] = useState('')
  const [cage, setCage] = useState('')
  const [cproduct, setCproduct] = useState('')
  const [cpoll, setCpoll] = useState<string[]>(['', ''])
  const [cimage, setCimage] = useState('')
  const [cpreview, setCpreview] = useState('')
  const [cuploading, setCuploading] = useState(false)
  const [posting, setPosting] = useState(false)

  // comments + threads
  const [openComments, setOpenComments] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, Comment[]>>({})
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<{ commentId: string; name: string } | null>(null)

  // notificações + ranking
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const [ranking, setRanking] = useState<Rank[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const qs = new URLSearchParams()
      if (channel) qs.set('channel', channel)
      if (sort === 'top') qs.set('sort', 'top')
      if (search) qs.set('q', search)
      const r = await fetch(`/api/community/posts${qs.toString() ? `?${qs}` : ''}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Erro ao carregar.'); setLoading(false); return }
      setMe(d.me || null)
      setAllowed(d.allowed !== false)
      setNeedsMigration(!!d.needsMigration)
      setPosts(d.posts || [])
    } catch { setErr('Erro de conexão.') }
    setLoading(false)
  }, [channel, sort, search])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const loadMeta = useCallback(async () => {
    try {
      const [n, r] = await Promise.all([
        fetch('/api/community/notifications', { cache: 'no-store' }).then(x => x.json()).catch(() => ({})),
        fetch('/api/community/ranking', { cache: 'no-store' }).then(x => x.json()).catch(() => ({})),
      ])
      setNotifs(n.items || []); setUnread(n.unread || 0); setRanking(r.top || [])
    } catch {}
  }, [])
  useEffect(() => {
    loadMeta()
    const t = setInterval(loadMeta, 60000)
    return () => clearInterval(t)
  }, [loadMeta])

  async function openNotifs() {
    const wasClosed = !notifOpen
    setNotifOpen(o => !o)
    if (wasClosed && unread > 0) {
      setUnread(0); setNotifs(prev => prev.map(n => ({ ...n, read: true })))
      try { await fetch('/api/community/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }) } catch {}
    }
  }

  async function react(p: Post, kind: string) {
    const had = (p.my_reactions || []).includes(kind)
    const flip = (toAdd: boolean) => setPosts(prev => prev.map(x => {
      if (x.id !== p.id) return x
      const reactions = { ...(x.reactions || {}) }
      reactions[kind] = Math.max(0, (reactions[kind] || 0) + (toAdd ? 1 : -1))
      const my = new Set(x.my_reactions || [])
      if (toAdd) my.add(kind); else my.delete(kind)
      return { ...x, reactions, my_reactions: [...my], reaction_count: Object.values(reactions).reduce((a, b) => a + b, 0) }
    }))
    flip(!had)
    try {
      const r = await fetch(`/api/community/posts/${p.id}/react`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && typeof d.count === 'number') {
        setPosts(prev => prev.map(x => {
          if (x.id !== p.id) return x
          const reactions = { ...(x.reactions || {}), [kind]: d.count }
          return { ...x, reactions, reaction_count: Object.values(reactions).reduce((a, b) => a + b, 0) }
        }))
      } else if (!r.ok) { flip(had) }
    } catch { flip(had) }
  }

  async function vote(p: Post, idx: number) {
    const snap = { poll_counts: p.poll_counts, my_poll_vote: p.my_poll_vote }
    setPosts(prev => prev.map(x => {
      if (x.id !== p.id) return x
      const counts = { ...(x.poll_counts || {}) }
      if (x.my_poll_vote != null && x.my_poll_vote !== idx) counts[x.my_poll_vote] = Math.max(0, (counts[x.my_poll_vote] || 0) - 1)
      if (x.my_poll_vote !== idx) counts[idx] = (counts[idx] || 0) + 1
      return { ...x, poll_counts: counts, my_poll_vote: idx }
    }))
    try {
      const r = await fetch(`/api/community/posts/${p.id}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ option_index: idx }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.counts) setPosts(prev => prev.map(x => x.id === p.id ? { ...x, poll_counts: d.counts, my_poll_vote: d.myVote } : x))
      else { setErr(d.error || 'Erro ao votar.'); setPosts(prev => prev.map(x => x.id === p.id ? { ...x, ...snap } : x)) }
    } catch { setPosts(prev => prev.map(x => x.id === p.id ? { ...x, ...snap } : x)) }
  }

  async function uploadImage(file: File) {
    setCuploading(true); setErr('')
    setCpreview(URL.createObjectURL(file))
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch('/api/community/upload', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.path) setCimage(d.path)
      else { setErr(d.error || 'Erro ao enviar a imagem.'); setCpreview('') }
    } catch { setErr('Erro de conexão ao enviar a imagem.'); setCpreview('') }
    setCuploading(false)
  }

  function clearImage() { setCimage(''); setCpreview('') }
  function resetComposer() {
    setOpen(false); setCbody(''); setCsale(''); setCage(''); setCproduct(''); setCpoll(['', '']); setCimage(''); setCpreview(''); setCkind('post'); setCchannel('geral')
  }

  async function submit() {
    if (posting || cuploading) return
    setPosting(true)
    try {
      const payload: any = { kind: ckind, data: {} }
      if (ckind === 'win') {
        payload.body = cbody
        payload.data = { sale_value: csale ? Number(csale.replace(/[^\d.]/g, '')) : undefined, lead_age_days: cage ? Number(cage) : undefined, product: cproduct || undefined }
      } else if (ckind === 'poll') {
        payload.channel = cchannel
        payload.body = cbody
        payload.data = { poll: { options: cpoll.map(o => o.trim()).filter(Boolean) } }
      } else {
        payload.channel = cchannel
        payload.body = cbody
      }
      if (cimage) payload.data = { ...payload.data, image_path: cimage }
      const r = await fetch('/api/community/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Erro ao publicar.'); setPosting(false); return }
      setPosts(prev => sortFeed([d.post, ...prev]))
      resetComposer(); setErr(''); loadMeta()
    } catch { setErr('Erro de conexão.') }
    setPosting(false)
  }

  async function toggleComments(p: Post) {
    setReplyTo(null); setDraft('')
    if (openComments === p.id) { setOpenComments(null); return }
    setOpenComments(p.id)
    if (!comments[p.id]) {
      try {
        const r = await fetch(`/api/community/posts/${p.id}/comments`, { cache: 'no-store' })
        const d = await r.json().catch(() => ({}))
        if (r.ok) setComments(prev => ({ ...prev, [p.id]: d.comments || [] }))
      } catch {}
    }
  }

  async function addComment(p: Post) {
    const text = draft.trim()
    if (!text) return
    const parent_id = replyTo?.commentId || undefined
    try {
      const r = await fetch(`/api/community/posts/${p.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text, parent_id }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.comment) {
        setComments(prev => ({ ...prev, [p.id]: [...(prev[p.id] || []), d.comment] }))
        setPosts(prev => prev.map(x => x.id === p.id ? { ...x, comment_count: x.comment_count + 1 } : x))
        setDraft(''); setReplyTo(null)
      } else {
        setErr(d.error || 'Não consegui enviar o comentário. Tente de novo.')
      }
    } catch { setErr('Erro de conexão.') }
  }

  async function del(p: Post) {
    if (!confirm('Remover esta publicação?')) return
    const snap = posts
    setPosts(prev => prev.filter(x => x.id !== p.id))
    try {
      const r = await fetch(`/api/community/posts/${p.id}`, { method: 'DELETE' })
      if (!r.ok) { setPosts(snap); setErr('Não consegui remover. Tente de novo.') }
    } catch { setPosts(snap); setErr('Erro de conexão.') }
  }

  async function pin(p: Post) {
    const snap = posts
    setPosts(prev => sortFeed(prev.map(x => x.id === p.id ? { ...x, pinned: !x.pinned } : x)))
    try {
      const r = await fetch(`/api/community/posts/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !p.pinned }) })
      if (!r.ok) setPosts(snap)
    } catch { setPosts(snap) }
  }

  async function saveEdit(p: Post) {
    const text = editDraft
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, body: text || null } : x))
    setEditingId(null)
    try {
      const r = await fetch(`/api/community/posts/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Erro ao editar.') }
    } catch { setErr('Erro de conexão.') }
  }

  const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 12 }
  const chip = (active: boolean): React.CSSProperties => ({ cursor: 'pointer', border: `1px solid ${active ? T.accent : T.border}`, background: active ? T.accentBg : T.chip, color: active ? T.accent : T.muted, borderRadius: 999, padding: '6px 13px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' })
  const inputStyle: React.CSSProperties = { width: '100%', background: T.input, border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 11px', fontSize: 14, color: T.text, outline: 'none' }
  const btn: React.CSSProperties = { cursor: 'pointer', border: 'none', background: T.accent, color: '#fff', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700 }
  const ghostBtn: React.CSSProperties = { cursor: 'pointer', border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, borderRadius: 10, padding: '8px 13px', fontSize: 13, fontWeight: 600 }

  const renderComment = (c: Comment, p: Post, isReply: boolean) => (
    <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 10, marginLeft: isReply ? 36 : 0 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: T.tag, color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(c.author_name)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13 }}><span style={{ fontWeight: 600, color: T.text }}>{c.author_name || 'Membro'}</span> <span style={{ color: T.muted, fontSize: 11 }}>· {ago(c.created_at)}</span></p>
        <p style={{ margin: 0, fontSize: 13, color: bodyColor, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{renderBody(c.body, T.accent)}</p>
        {!isReply && <button onClick={() => { setReplyTo({ commentId: c.id, name: c.author_name || 'Membro' }) }} style={{ border: 'none', background: 'transparent', color: T.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '2px 0', marginTop: 1 }}>Responder</button>}
      </div>
    </div>
  )

  if (allowed === false) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '32px 20px' }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>🔒</div>
        <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: T.text }}>A Comunidade é dos membros pagantes</p>
        <p style={{ margin: '0 0 14px', fontSize: 14, color: T.muted, lineHeight: 1.5 }}>Assine um plano do CRM ou compre créditos de lead pra trocar ideias, ver vitórias e aprender com quem fecha.</p>
        <a href="/dashboard/credits" style={{ ...btn, display: 'inline-block', textDecoration: 'none' }}>Ver planos e créditos</a>
      </div>
    )
  }

  return (
    <div>
      {/* sino de notificações */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10, position: 'relative' }}>
        <button onClick={openNotifs} aria-label="notificações" style={{ position: 'relative', border: `1px solid ${T.border}`, background: T.card, borderRadius: 999, width: 38, height: 38, cursor: 'pointer', fontSize: 17 }}>
          🔔
          {unread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', borderRadius: 999, minWidth: 18, height: 18, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{unread > 9 ? '9+' : unread}</span>}
        </button>
        {notifOpen && (
          <div style={{ position: 'absolute', top: 44, right: 0, width: 300, maxHeight: 360, overflowY: 'auto', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, zIndex: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
            <p style={{ margin: 0, padding: '10px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.text }}>Notificações</p>
            {notifs.length === 0 ? (
              <p style={{ margin: 0, padding: '18px 14px', fontSize: 13, color: T.muted, textAlign: 'center' }}>Nada por aqui ainda.</p>
            ) : notifs.map(n => (
              <div key={n.id} style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: bodyColor, background: n.read ? 'transparent' : T.accentBg }}>
                <span style={{ fontWeight: 600, color: T.text }}>{n.actor_name || 'Alguém'}</span> {n.type === 'comment' ? 'comentou no seu post' : n.type === 'mention' ? 'mencionou você' : 'reagiu no seu post'}{n.preview ? `: “${n.preview}”` : ''}
                <span style={{ display: 'block', color: T.muted, fontSize: 11, marginTop: 2 }}>{ago(n.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* canais */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
        {([['', 'Tudo'], ['fechamento', 'Fechamento'], ['follow_up', 'Follow-up'], ['vitorias', 'Vitórias']] as const).map(([v, label]) => (
          <span key={v} style={chip(channel === v)} onClick={() => setChannel(v as any)}>{label}</span>
        ))}
      </div>

      {/* ordenar + buscar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={chip(sort === 'recent')} onClick={() => setSort('recent')}>Recentes</span>
        <span style={chip(sort === 'top')} onClick={() => setSort('top')}>🔥 Em alta</span>
        <input style={{ ...inputStyle, flex: 1, minWidth: 150 }} placeholder="Buscar na comunidade…" value={searchInput} onChange={e => setSearchInput(e.target.value)} />
      </div>

      {/* ranking do mês */}
      {ranking.length > 0 && (
        <div style={card}>
          <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: T.text }}>🏆 Top fechadores do mês</p>
          {ranking.slice(0, 5).map((r, i) => (
            <div key={r.buyer_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
              <span style={{ width: 20, fontSize: 13, fontWeight: 700, color: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : T.muted }}>{i + 1}º</span>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(r.name)}</div>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>{r.count} {r.count === 1 ? 'venda' : 'vendas'}{r.total > 0 ? ` · ${money(r.total)}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {err && (
        <div style={{ ...card, marginBottom: 12, padding: '10px 14px', background: dark ? '#2a1416' : '#fef2f2', border: `1px solid ${dark ? '#5b2326' : '#fecaca'}`, color: '#ef4444', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>{err}</span>
          <span style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => setErr('')}>✕</span>
        </div>
      )}

      {/* compositor */}
      {!open ? (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials(me?.name)}</div>
          <button style={{ flex: 1, textAlign: 'left', background: T.input, border: `1px solid ${T.border}`, borderRadius: 999, padding: '9px 14px', color: T.muted, fontSize: 14, cursor: 'pointer' }} onClick={() => { setCkind('post'); setOpen(true) }}>Compartilhe uma vitória ou tire uma dúvida…</button>
          <button style={{ ...btn, padding: '9px 13px', whiteSpace: 'nowrap' }} onClick={() => { setCkind('win'); setOpen(true) }}>🏆 Venda</button>
        </div>
      ) : (
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {([['win', '🏆 Vitória'], ['post', '💬 Pergunta'], ['poll', '📊 Enquete'], ...(me?.isAdmin ? [['sacada', '💡 Sacada']] : [])] as [Kind, string][]).map(([k, label]) => (
              <span key={k} style={chip(ckind === k)} onClick={() => setCkind(k)}>{label}</span>
            ))}
          </div>

          {ckind === 'win' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 10 }}>
                <input style={inputStyle} placeholder="Valor da venda ($/ano)" value={csale} onChange={e => setCsale(e.target.value)} inputMode="numeric" />
                <input style={inputStyle} placeholder="Idade do lead (dias)" value={cage} onChange={e => setCage(e.target.value)} inputMode="numeric" />
                <input style={inputStyle} placeholder="Produto (ex: Vida)" value={cproduct} onChange={e => setCproduct(e.target.value)} />
              </div>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} placeholder="O que funcionou? (opcional)" value={cbody} onChange={e => setCbody(e.target.value)} />
            </>
          ) : ckind === 'poll' ? (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {(['fechamento', 'follow_up', 'geral'] as Channel[]).map(c => (
                  <span key={c} style={chip(cchannel === c)} onClick={() => setCchannel(c)}>{CHANNEL_LABEL[c]}</span>
                ))}
              </div>
              <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical', marginBottom: 10 }} placeholder="Pergunta da enquete…" value={cbody} onChange={e => setCbody(e.target.value)} />
              {cpoll.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input style={inputStyle} placeholder={`Opção ${i + 1}`} value={opt} onChange={e => setCpoll(prev => prev.map((o, j) => j === i ? e.target.value : o))} />
                  {cpoll.length > 2 && <button onClick={() => setCpoll(prev => prev.filter((_, j) => j !== i))} style={{ ...ghostBtn, padding: '0 11px' }}>✕</button>}
                </div>
              ))}
              {cpoll.length < 4 && <button onClick={() => setCpoll(prev => [...prev, ''])} style={{ ...ghostBtn, fontSize: 12, padding: '6px 11px' }}>+ opção</button>}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {(['fechamento', 'follow_up', 'geral'] as Channel[]).map(c => (
                  <span key={c} style={chip(cchannel === c)} onClick={() => setCchannel(c)}>{CHANNEL_LABEL[c]}</span>
                ))}
              </div>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder={ckind === 'sacada' ? 'Sua sacada da semana…  (use @nome pra mencionar)' : 'Sua pergunta ou comentário…  (use @nome pra mencionar)'} value={cbody} onChange={e => setCbody(e.target.value)} />
            </>
          )}

          {/* anexar imagem */}
          <div style={{ marginTop: 10 }}>
            {cpreview ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={cpreview} alt="" style={{ maxHeight: 130, maxWidth: '100%', borderRadius: 10, border: `1px solid ${T.border}`, display: 'block' }} />
                {cuploading && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 13, borderRadius: 10 }}>enviando…</span>}
                <button onClick={clearImage} aria-label="remover imagem" style={{ position: 'absolute', top: 5, right: 5, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 999, width: 22, height: 22, cursor: 'pointer', fontSize: 12, lineHeight: '22px', padding: 0 }}>✕</button>
              </div>
            ) : (
              <label style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                🖼️ Imagem
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.currentTarget.value = '' }} />
              </label>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button style={ghostBtn} onClick={() => { resetComposer(); setErr('') }}>Cancelar</button>
            <button style={{ ...btn, opacity: (posting || cuploading) ? 0.6 : 1 }} onClick={submit} disabled={posting || cuploading}>{posting ? 'Publicando…' : 'Publicar'}</button>
          </div>
        </div>
      )}

      {/* feed */}
      {loading ? (
        <p style={{ color: T.muted, fontSize: 14, padding: '20px 0', textAlign: 'center' }}>Carregando…</p>
      ) : needsMigration ? (
        <div style={{ ...card, color: T.muted, fontSize: 13 }}>A tabela da comunidade ainda não foi criada. Rode <code>supabase/migrations/022_community.sql</code> no Supabase.</div>
      ) : posts.length === 0 ? (
        err ? null : (
          <div style={{ ...card, textAlign: 'center', padding: '28px 20px', color: T.muted }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>🤝</div>
            <p style={{ margin: 0, fontSize: 14 }}>Ainda não tem nada por aqui. Seja o primeiro a compartilhar uma vitória.</p>
          </div>
        )
      ) : posts.map(p => {
        const pollTotal = Object.values(p.poll_counts || {}).reduce((a, b) => a + b, 0)
        return (
          <div key={p.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: p.kind === 'win' ? T.winBg : T.accentBg, color: p.kind === 'win' ? T.winText : T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials(p.author_name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text }}>{p.author_name || 'Membro'}</p>
                <p style={{ margin: 0, fontSize: 12, color: T.muted }}>{p.pinned && '📌 '}{ago(p.created_at)}</p>
              </div>
              {p.kind === 'win' && <span style={{ background: T.winBg, color: T.winText, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999 }}>🏆 vitória</span>}
              {p.kind === 'sacada' && <span style={{ background: T.accentBg, color: T.accent, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999 }}>💡 sacada</span>}
              {p.kind === 'poll' && <span style={{ background: T.accentBg, color: T.accent, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999 }}>📊 enquete</span>}
              {p.kind === 'post' && <span style={{ background: T.tag, color: T.muted, fontSize: 12, padding: '3px 9px', borderRadius: 999 }}>{CHANNEL_LABEL[p.channel]}</span>}
            </div>

            {p.title && <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: T.text }}>{p.title}</p>}
            {editingId === p.id ? (
              <div style={{ marginBottom: 10 }}>
                <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={editDraft} onChange={e => setEditDraft(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                  <button style={ghostBtn} onClick={() => setEditingId(null)}>Cancelar</button>
                  <button style={btn} onClick={() => saveEdit(p)}>Salvar</button>
                </div>
              </div>
            ) : (
              p.body && <p style={{ margin: '0 0 10px', fontSize: 14, color: bodyColor, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{renderBody(p.body, T.accent)}</p>
            )}

            {p.data?.image_path && (
              <img src={`/api/community/image?path=${encodeURIComponent(p.data.image_path)}`} alt="" loading="lazy" style={{ width: '100%', maxHeight: 460, objectFit: 'cover', borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 10, display: 'block' }} />
            )}

            {p.kind === 'poll' && p.data?.poll?.options && (
              <div style={{ marginBottom: 10 }}>
                {p.data.poll.options.map((opt, i) => {
                  const v = (p.poll_counts || {})[i] || 0
                  const pct = pollTotal ? Math.round((v / pollTotal) * 100) : 0
                  const mine = p.my_poll_vote === i
                  return (
                    <button key={i} onClick={() => vote(p, i)} style={{ position: 'relative', display: 'block', width: '100%', textAlign: 'left', border: `1px solid ${mine ? T.accent : T.border}`, background: 'transparent', borderRadius: 10, padding: '9px 12px', marginBottom: 6, cursor: 'pointer', overflow: 'hidden' }}>
                      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: T.accentBg, zIndex: 0 }} />
                      <span style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, color: T.text, fontWeight: mine ? 700 : 500 }}>
                        <span>{mine ? '✓ ' : ''}{opt}</span>
                        <span style={{ color: T.muted }}>{pct}% · {v}</span>
                      </span>
                    </button>
                  )
                })}
                <p style={{ margin: '2px 0 0', fontSize: 11, color: T.muted }}>{pollTotal} {pollTotal === 1 ? 'voto' : 'votos'}</p>
              </div>
            )}

            {p.kind === 'win' && (p.data?.sale_value || p.data?.lead_age_days || p.data?.product) && (
              <div style={{ background: T.winBg, borderRadius: 10, padding: '11px 14px', display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10 }}>
                {p.data.sale_value ? <div><p style={{ margin: 0, fontSize: 11, color: T.win }}>Venda</p><p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.winText }}>{money(p.data.sale_value)}</p></div> : null}
                {p.data.lead_age_days != null ? <div><p style={{ margin: 0, fontSize: 11, color: T.win }}>Idade do lead</p><p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.winText }}>{p.data.lead_age_days} {p.data.lead_age_days === 1 ? 'dia' : 'dias'}</p></div> : null}
                {p.data.product ? <div><p style={{ margin: 0, fontSize: 11, color: T.win }}>Produto</p><p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.winText }}>{p.data.product}</p></div> : null}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {REACTIONS.map(({ kind, emoji }) => {
                const count = (p.reactions || {})[kind] || 0
                const mine = (p.my_reactions || []).includes(kind)
                return (
                  <button key={kind} onClick={() => react(p, kind)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, border: `1px solid ${mine ? T.accent : T.border}`, background: mine ? T.accentBg : 'transparent', color: mine ? T.accent : T.muted, borderRadius: 999, padding: '4px 9px', fontSize: 13, fontWeight: 600 }}>{emoji}{count > 0 ? ` ${count}` : ''}</button>
                )
              })}
              <button style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, borderRadius: 999, padding: '4px 10px', fontSize: 13, fontWeight: 600 }} onClick={() => toggleComments(p)}>💬 {p.comment_count > 0 ? p.comment_count : ''}</button>
              <div style={{ flex: 1 }} />
              {me?.isAdmin && <button style={{ ...ghostBtn, padding: '4px 9px', fontSize: 12 }} onClick={() => pin(p)}>{p.pinned ? 'Desafixar' : 'Fixar'}</button>}
              {p.can_delete && editingId !== p.id && <button style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: T.muted, fontSize: 12, padding: '4px 6px' }} onClick={() => { setEditingId(p.id); setEditDraft(p.body || '') }}>Editar</button>}
              {p.can_delete && <button style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: T.muted, fontSize: 12, padding: '4px 6px' }} onClick={() => del(p)}>Excluir</button>}
            </div>

            {openComments === p.id && (
              <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                {(comments[p.id] || []).filter(c => !c.parent_id).map(c => (
                  <div key={c.id}>
                    {renderComment(c, p, false)}
                    {(comments[p.id] || []).filter(rc => rc.parent_id === c.id).map(rc => renderComment(rc, p, true))}
                  </div>
                ))}
                {replyTo && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: T.muted, marginBottom: 6 }}>
                    <span>respondendo a <span style={{ fontWeight: 600, color: T.text }}>{replyTo.name}</span></span>
                    <span style={{ cursor: 'pointer' }} onClick={() => setReplyTo(null)}>✕</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <input style={{ ...inputStyle, flex: 1 }} placeholder={replyTo ? `Responder a ${replyTo.name}…` : 'Escreva um comentário…  (use @nome)'} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment(p) }} />
                  <button style={btn} onClick={() => addComment(p)}>Enviar</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
