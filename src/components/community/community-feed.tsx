'use client'

import { useEffect, useState, useCallback } from 'react'

type Kind = 'sacada' | 'win' | 'post'
type Channel = 'fechamento' | 'follow_up' | 'vitorias' | 'geral'

interface Post {
  id: string
  buyer_id: string | null
  author_name: string | null
  kind: Kind
  channel: Channel
  title: string | null
  body: string | null
  data: { sale_value?: number; lead_age_days?: number; product?: string; image_path?: string }
  pinned: boolean
  created_at: string
  reaction_count: number
  reacted: boolean
  comment_count: number
  can_delete: boolean
}
interface Me { id: string; name: string; isAdmin: boolean }
interface Comment { id: string; author_name: string | null; body: string; created_at: string; can_delete: boolean; buyer_id: string | null }
interface Notif { id: string; actor_name: string | null; type: string; post_id: string | null; preview: string | null; read: boolean; created_at: string }
interface Rank { buyer_id: string; name: string; count: number; total: number }

const CHANNEL_LABEL: Record<Channel, string> = { fechamento: 'Fechamento', follow_up: 'Follow-up', vitorias: 'Vitórias', geral: 'Geral' }

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
// Mesma ordem do servidor: fixados primeiro, depois mais recentes.
function sortFeed(list: Post[]) {
  return [...list].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
}

export function CommunityFeed({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const dark = theme === 'dark'
  const T = dark
    ? { card: '#16161f', border: '#262633', text: '#f5f5f7', muted: '#9aa0ac', accent: '#a78bfa', accentBg: '#241f3d', input: '#0f0f17', win: '#34d399', winBg: '#10261d', winText: '#6ee7b7', tag: '#20202c', chip: '#16161f' }
    : { card: '#ffffff', border: '#e8ecf4', text: '#1a1a2e', muted: '#64748b', accent: '#6366f1', accentBg: '#eef2ff', input: '#ffffff', win: '#059669', winBg: '#ecfdf5', winText: '#047857', tag: '#f1f5f9', chip: '#ffffff' }

  const [me, setMe] = useState<Me | null>(null)
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [posts, setPosts] = useState<Post[]>([])
  const [channel, setChannel] = useState<'' | Channel>('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // composer
  const [open, setOpen] = useState(false)
  const [ckind, setCkind] = useState<Kind>('post')
  const [cchannel, setCchannel] = useState<Channel>('geral')
  const [cbody, setCbody] = useState('')
  const [csale, setCsale] = useState('')
  const [cage, setCage] = useState('')
  const [cproduct, setCproduct] = useState('')
  const [cimage, setCimage] = useState('')      // path no storage (community/...)
  const [cpreview, setCpreview] = useState('')  // object URL local pra preview
  const [cuploading, setCuploading] = useState(false)
  const [posting, setPosting] = useState(false)

  // comments
  const [openComments, setOpenComments] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, Comment[]>>({})
  const [draft, setDraft] = useState('')

  // notificações + ranking
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const [ranking, setRanking] = useState<Rank[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const r = await fetch(`/api/community/posts${channel ? `?channel=${channel}` : ''}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Erro ao carregar.'); setLoading(false); return }
      setMe(d.me || null)
      setAllowed(d.allowed !== false)
      setNeedsMigration(!!d.needsMigration)
      setPosts(d.posts || [])
    } catch { setErr('Erro de conexão.') }
    setLoading(false)
  }, [channel])

  useEffect(() => { load() }, [load])

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

  async function react(p: Post) {
    const snap = { reacted: p.reacted, reaction_count: p.reaction_count }
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, reacted: !x.reacted, reaction_count: x.reaction_count + (x.reacted ? -1 : 1) } : x))
    try {
      const r = await fetch(`/api/community/posts/${p.id}/react`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (r.ok) {
        setPosts(prev => prev.map(x => x.id === p.id ? {
          ...x,
          reacted: typeof d.reacted === 'boolean' ? d.reacted : x.reacted,
          reaction_count: typeof d.count === 'number' ? d.count : x.reaction_count,
        } : x))
      } else {
        setPosts(prev => prev.map(x => x.id === p.id ? { ...x, ...snap } : x))
      }
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

  async function submit() {
    if (posting || cuploading) return
    setPosting(true)
    try {
      const payload: any = { kind: ckind, data: {} }
      if (ckind === 'win') {
        payload.body = cbody
        payload.data = { sale_value: csale ? Number(csale.replace(/[^\d.]/g, '')) : undefined, lead_age_days: cage ? Number(cage) : undefined, product: cproduct || undefined }
      } else {
        payload.channel = cchannel
        payload.body = cbody
      }
      if (cimage) payload.data = { ...payload.data, image_path: cimage }
      const r = await fetch('/api/community/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Erro ao publicar.'); setPosting(false); return }
      setPosts(prev => sortFeed([d.post, ...prev]))
      setOpen(false); setCbody(''); setCsale(''); setCage(''); setCproduct(''); setCimage(''); setCpreview(''); setCkind('post'); setCchannel('geral'); setErr(''); loadMeta()
    } catch { setErr('Erro de conexão.') }
    setPosting(false)
  }

  async function toggleComments(p: Post) {
    if (openComments === p.id) { setOpenComments(null); return }
    setOpenComments(p.id); setDraft('')
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
    try {
      const r = await fetch(`/api/community/posts/${p.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.comment) {
        setComments(prev => ({ ...prev, [p.id]: [...(prev[p.id] || []), d.comment] }))
        setPosts(prev => prev.map(x => x.id === p.id ? { ...x, comment_count: x.comment_count + 1 } : x))
        setDraft('')  // limpa SÓ no sucesso — texto preservado se falhar
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

  const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 12 }
  const chip = (active: boolean): React.CSSProperties => ({ cursor: 'pointer', border: `1px solid ${active ? T.accent : T.border}`, background: active ? T.accentBg : T.chip, color: active ? T.accent : T.muted, borderRadius: 999, padding: '6px 13px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' })
  const inputStyle: React.CSSProperties = { width: '100%', background: T.input, border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 11px', fontSize: 14, color: T.text, outline: 'none' }
  const btn: React.CSSProperties = { cursor: 'pointer', border: 'none', background: T.accent, color: '#fff', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700 }
  const ghostBtn: React.CSSProperties = { cursor: 'pointer', border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, borderRadius: 10, padding: '8px 13px', fontSize: 13, fontWeight: 600 }

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
              <div key={n.id} style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: dark ? '#d6d8de' : '#334155', background: n.read ? 'transparent' : T.accentBg }}>
                <span style={{ fontWeight: 600, color: T.text }}>{n.actor_name || 'Alguém'}</span> {n.type === 'comment' ? 'comentou no seu post' : 'reagiu no seu post'}{n.preview ? `: “${n.preview}”` : ''}
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

      {/* erro global sempre visível (load, excluir, comentar, etc.) */}
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
            {([['win', '🏆 Vitória'], ['post', '💬 Pergunta'], ...(me?.isAdmin ? [['sacada', '💡 Sacada']] : [])] as [Kind, string][]).map(([k, label]) => (
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
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {(['fechamento', 'follow_up', 'geral'] as Channel[]).map(c => (
                  <span key={c} style={chip(cchannel === c)} onClick={() => setCchannel(c)}>{CHANNEL_LABEL[c]}</span>
                ))}
              </div>
              <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder={ckind === 'sacada' ? 'Sua sacada da semana…' : 'Sua pergunta ou comentário…'} value={cbody} onChange={e => setCbody(e.target.value)} />
            </>
          )}

          {/* anexar imagem — qualquer tipo de post */}
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
            <button style={ghostBtn} onClick={() => { setOpen(false); setErr(''); clearImage() }}>Cancelar</button>
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
      ) : posts.map(p => (
        <div key={p.id} style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: p.kind === 'win' ? T.winBg : T.accentBg, color: p.kind === 'win' ? T.winText : T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials(p.author_name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text }}>{p.author_name || 'Membro'}</p>
              <p style={{ margin: 0, fontSize: 12, color: T.muted }}>{p.pinned && '📌 '}{ago(p.created_at)}</p>
            </div>
            {p.kind === 'win' && <span style={{ background: T.winBg, color: T.winText, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999 }}>🏆 vitória</span>}
            {p.kind === 'sacada' && <span style={{ background: T.accentBg, color: T.accent, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999 }}>💡 sacada</span>}
            {p.kind === 'post' && <span style={{ background: T.tag, color: T.muted, fontSize: 12, padding: '3px 9px', borderRadius: 999 }}>{CHANNEL_LABEL[p.channel]}</span>}
          </div>

          {p.title && <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: T.text }}>{p.title}</p>}
          {p.body && <p style={{ margin: '0 0 10px', fontSize: 14, color: dark ? '#d6d8de' : '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{p.body}</p>}

          {p.data?.image_path && (
            <img src={`/api/community/image?path=${encodeURIComponent(p.data.image_path)}`} alt="" loading="lazy" style={{ width: '100%', maxHeight: 460, objectFit: 'cover', borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 10, display: 'block' }} />
          )}

          {p.kind === 'win' && (p.data?.sale_value || p.data?.lead_age_days || p.data?.product) && (
            <div style={{ background: T.winBg, borderRadius: 10, padding: '11px 14px', display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10 }}>
              {p.data.sale_value ? <div><p style={{ margin: 0, fontSize: 11, color: T.win }}>Venda</p><p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.winText }}>{money(p.data.sale_value)}</p></div> : null}
              {p.data.lead_age_days != null ? <div><p style={{ margin: 0, fontSize: 11, color: T.win }}>Idade do lead</p><p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.winText }}>{p.data.lead_age_days} {p.data.lead_age_days === 1 ? 'dia' : 'dias'}</p></div> : null}
              {p.data.product ? <div><p style={{ margin: 0, fontSize: 11, color: T.win }}>Produto</p><p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.winText }}>{p.data.product}</p></div> : null}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${p.reacted ? T.accent : T.border}`, background: p.reacted ? T.accentBg : 'transparent', color: p.reacted ? T.accent : T.muted, borderRadius: 999, padding: '4px 11px', fontSize: 13, fontWeight: 600 }} onClick={() => react(p)}>👍 {p.reaction_count > 0 ? p.reaction_count : ''}</button>
            <button style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, borderRadius: 999, padding: '4px 11px', fontSize: 13, fontWeight: 600 }} onClick={() => toggleComments(p)}>💬 {p.comment_count > 0 ? p.comment_count : ''}</button>
            <div style={{ flex: 1 }} />
            {me?.isAdmin && <button style={{ ...ghostBtn, padding: '4px 9px', fontSize: 12 }} onClick={() => pin(p)}>{p.pinned ? 'Desafixar' : 'Fixar'}</button>}
            {p.can_delete && <button style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: T.muted, fontSize: 12, padding: '4px 6px' }} onClick={() => del(p)}>Excluir</button>}
          </div>

          {openComments === p.id && (
            <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
              {(comments[p.id] || []).map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: T.tag, color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(c.author_name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13 }}><span style={{ fontWeight: 600, color: T.text }}>{c.author_name || 'Membro'}</span> <span style={{ color: T.muted, fontSize: 11 }}>· {ago(c.created_at)}</span></p>
                    <p style={{ margin: 0, fontSize: 13, color: dark ? '#d6d8de' : '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.body}</p>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder="Escreva um comentário…" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment(p) }} />
                <button style={btn} onClick={() => addComment(p)}>Enviar</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
