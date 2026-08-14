'use client'

import { useEffect, useState, useCallback } from 'react'
import { useT } from '@/lib/i18n-client'

type Kind = 'sacada' | 'win' | 'post' | 'poll' | 'aviso'
type Channel = 'fechamento' | 'follow_up' | 'vitorias' | 'geral' | 'avisos'

interface Post {
  id: string
  buyer_id: string | null
  author_name: string | null
  kind: Kind
  channel: Channel
  title: string | null
  body: string | null
  data: { sale_value?: number; lead_age_days?: number; product?: string; image_path?: string; video_path?: string; poll?: { options: string[] } }
  comments?: Comment[]
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
  author_avatar?: string | null
}
interface Me { id: string; name: string; isAdmin: boolean }
interface Comment { id: string; author_name: string | null; body: string; created_at: string; can_delete: boolean; buyer_id: string | null; parent_id?: string | null; author_avatar?: string | null }
interface Notif { id: string; actor_name: string | null; type: string; post_id: string | null; preview: string | null; read: boolean; created_at: string }
interface Rank { buyer_id: string; name: string; count: number; total: number }

type Tr = (pt: string, en: string, es: string) => string
const channelLabels = (L: Tr): Record<Channel, string> => ({ fechamento: L('Fechamento', 'Closing', 'Cierre'), follow_up: L('Follow-up', 'Follow-up', 'Seguimiento'), vitorias: L('Vitórias', 'Wins', 'Victorias'), geral: L('Geral', 'General', 'General'), avisos: L('Avisos', 'Announcements', 'Avisos') })
const REACTIONS: { kind: string; emoji: string }[] = [
  { kind: 'like', emoji: '👍' }, { kind: 'fire', emoji: '🔥' }, { kind: 'clap', emoji: '👏' }, { kind: 'party', emoji: '🎉' },
]

function initials(name?: string | null) {
  return (name || 'M').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}
// Avatar: foto do perfil se tiver, senão as iniciais.
function Av({ name, path, size, bg, fg, onClick }: { name?: string | null; path?: string | null; size: number; bg: string; fg: string; onClick?: () => void }) {
  const base: React.CSSProperties = { width: size, height: size, borderRadius: '50%', flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }
  if (path) return <img src={`/api/community/image?path=${encodeURIComponent(path)}`} alt="" onClick={onClick} style={{ ...base, objectFit: 'cover', display: 'block' }} />
  return <div onClick={onClick} style={{ ...base, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.36), fontWeight: 700 }}>{initials(name)}</div>
}
function ago(iso: string, locale: string = 'pt') {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return locale === 'en' ? 'now' : locale === 'es' ? 'ahora' : 'agora'
  if (s < 3600) return `${Math.floor(s / 60)}min`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 604800) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString(locale === 'en' ? 'en-US' : locale === 'es' ? 'es-US' : 'pt-BR')
}
function money(n?: number) {
  if (!n) return ''
  return '$' + n.toLocaleString('en-US')
}
function sortFeed(list: Post[]) {
  return [...list].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
}
// Destaca @menções e torna URLs clicáveis (visual; a notificação é casada no servidor).
function renderBody(text: string, accent: string): React.ReactNode {
  return text.split(/(\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+|@[\p{L}\d._-]+)/gu).map((part, i) => {
    if (!part) return null
    if (/^https?:\/\//i.test(part) || /^www\./i.test(part)) {
      // Tira pontuação no fim que provavelmente não faz parte da URL (ex: "veja https://x.com.")
      const trail = (part.match(/[.,;:!?)\]]+$/) || [''])[0]
      const core = trail ? part.slice(0, part.length - trail.length) : part
      const href = /^https?:\/\//i.test(core) ? core : `https://${core}`
      return (
        <span key={i}>
          <a href={href} target="_blank" rel="noopener noreferrer nofollow" style={{ color: accent, fontWeight: 600, textDecoration: 'underline', overflowWrap: 'anywhere' }}>{core}</a>{trail}
        </span>
      )
    }
    if (part.startsWith('@')) return <span key={i} style={{ color: accent, fontWeight: 600 }}>{part}</span>
    return part
  })
}

export function CommunityFeed({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
  const CHANNEL_LABEL = channelLabels(L)
  const dark = theme === 'dark'
  const T = dark
    ? { card: '#16161f', border: '#262633', text: '#f5f5f7', muted: '#9aa0ac', accent: '#a78bfa', accentBg: '#241f3d', input: '#0f0f17', win: '#34d399', winBg: '#10261d', winText: '#6ee7b7', tag: '#20202c', chip: '#16161f' }
    : { card: '#ffffff', border: 'var(--border)', text: '#1a1a2e', muted: '#64748b', accent: '#6366f1', accentBg: 'var(--accent-light)', input: '#ffffff', win: '#059669', winBg: '#ecfdf5', winText: '#047857', tag: 'var(--bg-soft)', chip: '#ffffff' }
  const bodyColor = dark ? '#d6d8de' : '#334155'

  const [me, setMe] = useState<Me | null>(null)
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [banned, setBanned] = useState(false)
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
  const [profileId, setProfileId] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)

  // DM 1-a-1
  const [dmOpen, setDmOpen] = useState(false)
  const [dmConvs, setDmConvs] = useState<any[]>([])
  const [dmUnread, setDmUnread] = useState(0)
  const [dmActive, setDmActive] = useState<{ id: string; name: string } | null>(null)
  const [dmMessages, setDmMessages] = useState<any[]>([])
  const [dmDraft, setDmDraft] = useState('')

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
  const [cvideo, setCvideo] = useState('')
  const [cvideoName, setCvideoName] = useState('')
  const [cvideoUploading, setCvideoUploading] = useState(false)
  const [posting, setPosting] = useState(false)

  // comments + threads (sempre abertos; rascunho POR post)
  const [comments, setComments] = useState<Record<string, Comment[]>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [replyTo, setReplyTo] = useState<{ postId: string; commentId: string; name: string } | null>(null)

  // notificações + ranking
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [unread, setUnread] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const [ranking, setRanking] = useState<Rank[]>([])

  // integrantes da comunidade
  const [membersOpen, setMembersOpen] = useState(false)
  const [members, setMembers] = useState<{ id: string; name: string; isAdmin: boolean; bio: string | null; avatar_path: string | null }[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')

  // meu perfil (foto + nome + bio)
  const [myProfile, setMyProfile] = useState<{ name: string; bio: string | null; avatar_path: string | null } | null>(null)
  const [profileEdit, setProfileEdit] = useState(false)
  const [peName, setPeName] = useState('')
  const [peBio, setPeBio] = useState('')
  const [peAvatar, setPeAvatar] = useState('')
  const [peUploading, setPeUploading] = useState(false)
  const [peSaving, setPeSaving] = useState(false)

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
      if (!r.ok) { setErr(d.error || L('Erro ao carregar.', 'Failed to load.', 'Error al cargar.')); setLoading(false); return }
      setMe(d.me || null)
      setAllowed(d.allowed !== false)
      setBanned(!!d.banned)
      setNeedsMigration(!!d.needsMigration)
      setPosts(d.posts || [])
      // Comentários vêm embutidos no feed (sempre visíveis, sem clique)
      const cm: Record<string, Comment[]> = {}
      for (const p of (d.posts || [])) cm[p.id] = p.comments || []
      setComments(cm)
    } catch { setErr(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')) }
    setLoading(false)
  }, [channel, sort, search])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])
  useEffect(() => {
    if (!profileId) { setProfile(null); return }
    let cancelled = false
    setProfile(null)
    fetch(`/api/community/members/${profileId}`, { cache: 'no-store' }).then(r => r.json()).then(d => { if (!cancelled) setProfile(d) }).catch(() => {})
    return () => { cancelled = true }
  }, [profileId])

  const loadMeta = useCallback(async () => {
    try {
      const [n, r, dm, prof] = await Promise.all([
        fetch('/api/community/notifications', { cache: 'no-store' }).then(x => x.json()).catch(() => ({})),
        fetch('/api/community/ranking', { cache: 'no-store' }).then(x => x.json()).catch(() => ({})),
        fetch('/api/community/dm', { cache: 'no-store' }).then(x => x.json()).catch(() => ({})),
        fetch('/api/community/profile', { cache: 'no-store' }).then(x => x.json()).catch(() => ({})),
      ])
      setNotifs(n.items || []); setUnread(n.unread || 0); setRanking(r.top || [])
      setDmConvs(dm.conversations || []); setDmUnread(dm.unread || 0)
      if (prof && prof.name) setMyProfile({ name: prof.name, bio: prof.bio || null, avatar_path: prof.avatar_path || null })
    } catch {}
  }, [])

  const loadConversation = useCallback(async (otherId: string) => {
    try {
      const r = await fetch(`/api/community/dm/${otherId}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      setDmMessages(d.messages || [])
    } catch {}
  }, [])
  useEffect(() => {
    if (!dmOpen || !dmActive) return
    const t = setInterval(() => loadConversation(dmActive.id), 6000)
    return () => clearInterval(t)
  }, [dmOpen, dmActive, loadConversation])
  useEffect(() => {
    loadMeta()
    const t = setInterval(loadMeta, 60000)
    return () => clearInterval(t)
  }, [loadMeta])

  async function openMembers() {
    setMemberSearch('')
    setMembersOpen(true)
    setMembersLoading(true)
    try {
      const d = await fetch('/api/community/members', { cache: 'no-store' }).then(r => r.json())
      setMembers(d.members || [])
    } catch {}
    setMembersLoading(false)
  }

  function openProfileEdit() {
    setPeName(myProfile?.name || me?.name || '')
    setPeBio(myProfile?.bio || '')
    setPeAvatar(myProfile?.avatar_path || '')
    setProfileEdit(true)
  }

  async function uploadAvatar(file: File) {
    setPeUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/community/upload', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.path) setPeAvatar(d.path)
      else alert(d.error || L('Falha no upload da foto.', 'Photo upload failed.', 'Falló la subida de la foto.'))
    } catch { alert(L('Falha no upload da foto.', 'Photo upload failed.', 'Falló la subida de la foto.')) }
    setPeUploading(false)
  }

  async function saveProfile() {
    if (peSaving) return
    setPeSaving(true)
    try {
      const r = await fetch('/api/community/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: peName, bio: peBio, avatar_path: peAvatar }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { setProfileEdit(false); loadMeta(); load() }
      else alert(d.error || L('Não foi possível salvar o perfil.', 'Could not save your profile.', 'No se pudo guardar el perfil.'))
    } catch { alert(L('Falha de conexão.', 'Connection failed.', 'Falla de conexión.')) }
    setPeSaving(false)
  }

  async function openNotifs() {
    const wasClosed = !notifOpen
    setNotifOpen(o => !o)
    if (wasClosed && unread > 0) {
      setUnread(0); setNotifs(prev => prev.map(n => ({ ...n, read: true })))
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('community-unread-changed'))
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
      else { setErr(d.error || L('Erro ao votar.', 'Failed to vote.', 'Error al votar.')); setPosts(prev => prev.map(x => x.id === p.id ? { ...x, ...snap } : x)) }
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
      else { setErr(d.error || L('Erro ao enviar a imagem.', 'Failed to upload the image.', 'Error al subir la imagen.')); setCpreview('') }
    } catch { setErr(L('Erro de conexão ao enviar a imagem.', 'Connection error while uploading the image.', 'Error de conexión al subir la imagen.')); setCpreview('') }
    setCuploading(false)
  }

  function clearImage() { setCimage(''); setCpreview('') }
  function clearVideo() { setCvideo(''); setCvideoName('') }
  function resetComposer() {
    setOpen(false); setCbody(''); setCsale(''); setCage(''); setCproduct(''); setCpoll(['', '']); setCimage(''); setCpreview(''); setCvideo(''); setCvideoName(''); setCkind('post'); setCchannel('geral')
  }

  // Vídeo sobe DIRETO pro storage (URL assinada) — não passa pelo servidor (limite de 4.5MB).
  async function uploadVideo(file: File) {
    if (file.size > 200 * 1024 * 1024) { setErr(L('Vídeo muito grande (máx 200MB).', 'Video too large (max 200MB).', 'Video demasiado grande (máx. 200MB).')); return }
    setCvideoUploading(true)
    setErr('')
    try {
      const r = await fetch('/api/community/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mime: file.type }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.signedUrl) { setErr(d.error || L('Falha ao preparar o upload.', 'Failed to prepare the upload.', 'Falló la preparación de la subida.')); setCvideoUploading(false); return }
      const up = await fetch(d.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!up.ok) { setErr(L('Falha no upload do vídeo — tenta de novo.', 'Video upload failed — try again.', 'Falló la subida del video — intenta de nuevo.')); setCvideoUploading(false); return }
      setCvideo(d.path)
      setCvideoName(file.name)
    } catch { setErr(L('Falha no upload do vídeo.', 'Video upload failed.', 'Falló la subida del video.')) }
    setCvideoUploading(false)
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
      if (cvideo) payload.data = { ...payload.data, video_path: cvideo }
      const r = await fetch('/api/community/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || L('Erro ao publicar.', 'Failed to publish.', 'Error al publicar.')); setPosting(false); return }
      setPosts(prev => sortFeed([d.post, ...prev]))
      resetComposer(); setErr(''); loadMeta()
    } catch { setErr(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')) }
    setPosting(false)
  }

  async function addComment(p: Post) {
    const text = (drafts[p.id] || '').trim()
    if (!text) return
    const parent_id = replyTo?.postId === p.id ? replyTo.commentId : undefined
    try {
      const r = await fetch(`/api/community/posts/${p.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text, parent_id }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.comment) {
        const mine = { ...d.comment, author_avatar: d.comment.author_avatar || myProfile?.avatar_path || null }
        setComments(prev => ({ ...prev, [p.id]: [...(prev[p.id] || []), mine] }))
        setPosts(prev => prev.map(x => x.id === p.id ? { ...x, comment_count: x.comment_count + 1 } : x))
        setDrafts(prev => ({ ...prev, [p.id]: '' })); setReplyTo(null)
      } else {
        setErr(d.error || L('Não consegui enviar o comentário. Tente de novo.', 'Could not post your comment. Try again.', 'No se pudo enviar el comentario. Intenta de nuevo.'))
      }
    } catch { setErr(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')) }
  }

  async function del(p: Post) {
    if (!confirm(L('Remover esta publicação?', 'Remove this post?', '¿Eliminar esta publicación?'))) return
    const snap = posts
    setPosts(prev => prev.filter(x => x.id !== p.id))
    try {
      const r = await fetch(`/api/community/posts/${p.id}`, { method: 'DELETE' })
      if (!r.ok) { setPosts(snap); setErr(L('Não consegui remover. Tente de novo.', 'Could not remove it. Try again.', 'No se pudo eliminar. Intenta de nuevo.')) }
    } catch { setPosts(snap); setErr(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')) }
  }

  async function pin(p: Post) {
    const snap = posts
    setPosts(prev => sortFeed(prev.map(x => x.id === p.id ? { ...x, pinned: !x.pinned } : x)))
    try {
      const r = await fetch(`/api/community/posts/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: !p.pinned }) })
      if (!r.ok) setPosts(snap)
    } catch { setPosts(snap) }
  }

  async function toggleBan(targetId: string, currentlyBanned: boolean) {
    try {
      const r = await fetch(`/api/community/members/${targetId}/ban`, { method: currentlyBanned ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: currentlyBanned ? undefined : JSON.stringify({}) })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { setProfile((pf: any) => pf ? { ...pf, banned: !currentlyBanned } : pf); load() }
      else setErr(d.error || L('Erro ao bloquear.', 'Failed to block.', 'Error al bloquear.'))
    } catch { setErr(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')) }
  }

  async function delComment(p: Post, commentId: string) {
    if (!confirm(L('Remover este comentário?', 'Remove this comment?', '¿Eliminar este comentario?'))) return
    setComments(prev => ({ ...prev, [p.id]: (prev[p.id] || []).filter(c => c.id !== commentId && c.parent_id !== commentId) }))
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, comment_count: Math.max(0, x.comment_count - 1) } : x))
    try { await fetch(`/api/community/posts/${p.id}/comments`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment_id: commentId }) }) } catch {}
  }

  async function saveEdit(p: Post) {
    const text = editDraft
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, body: text || null } : x))
    setEditingId(null)
    try {
      const r = await fetch(`/api/community/posts/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || L('Erro ao editar.', 'Failed to edit.', 'Error al editar.')) }
    } catch { setErr(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')) }
  }

  async function loadDmList() {
    try {
      const r = await fetch('/api/community/dm', { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      setDmConvs(d.conversations || []); setDmUnread(d.unread || 0)
    } catch {}
  }
  function openConversation(id: string, name: string) {
    setProfileId(null); setDmActive({ id, name }); setDmMessages([]); setDmDraft(''); setDmOpen(true)
    setDmUnread(u => Math.max(0, u - (dmConvs.find(c => c.otherId === id)?.unread || 0)))
    loadConversation(id)
  }
  async function sendDm() {
    if (!dmActive) return
    const text = dmDraft.trim()
    if (!text) return
    setDmDraft('')
    try {
      const r = await fetch(`/api/community/dm/${dmActive.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.message) setDmMessages(prev => [...prev, d.message])
      else { setErr(d.error || L('Erro ao enviar a mensagem.', 'Failed to send the message.', 'Error al enviar el mensaje.')); setDmDraft(text) }
    } catch { setErr(L('Erro de conexão.', 'Connection error.', 'Error de conexión.')); setDmDraft(text) }
  }

  const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 12 }
  const chip = (active: boolean): React.CSSProperties => ({ cursor: 'pointer', border: `1px solid ${active ? T.accent : T.border}`, background: active ? T.accentBg : T.chip, color: active ? T.accent : T.muted, borderRadius: 999, padding: '6px 13px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' })
  const inputStyle: React.CSSProperties = { width: '100%', background: T.input, border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 11px', fontSize: 14, color: T.text, outline: 'none' }
  const btn: React.CSSProperties = { cursor: 'pointer', border: 'none', background: T.accent, color: '#fff', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700 }
  const ghostBtn: React.CSSProperties = { cursor: 'pointer', border: `1px solid ${T.border}`, background: 'transparent', color: T.muted, borderRadius: 10, padding: '8px 13px', fontSize: 13, fontWeight: 600 }

  const renderComment = (c: Comment, p: Post, isReply: boolean) => (
    <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 10, marginLeft: isReply ? 36 : 0 }}>
      <Av name={c.author_name} path={c.author_avatar} size={28} bg={T.tag} fg={T.muted} onClick={c.buyer_id ? () => setProfileId(c.buyer_id) : undefined} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13 }}><span onClick={() => c.buyer_id && setProfileId(c.buyer_id)} style={{ fontWeight: 600, color: T.text, cursor: c.buyer_id ? 'pointer' : 'default' }}>{c.author_name || L('Membro', 'Member', 'Miembro')}</span> <span style={{ color: T.muted, fontSize: 11 }}>· {ago(c.created_at, t._locale)}</span></p>
        <p style={{ margin: 0, fontSize: 13, color: bodyColor, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{renderBody(c.body, T.accent)}</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 1 }}>
          {!isReply && <button onClick={() => { setReplyTo({ postId: p.id, commentId: c.id, name: c.author_name || L('Membro', 'Member', 'Miembro') }) }} style={{ border: 'none', background: 'transparent', color: T.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '2px 0' }}>{L('Responder', 'Reply', 'Responder')}</button>}
          {c.can_delete && <button onClick={() => delComment(p, c.id)} style={{ border: 'none', background: 'transparent', color: T.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '2px 0' }}>{L('Excluir', 'Delete', 'Eliminar')}</button>}
        </div>
      </div>
    </div>
  )

  if (allowed === false) {
    if (banned) {
      return (
        <div style={{ ...card, textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🚫</div>
          <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: T.text }}>{L('Seu acesso à comunidade foi removido', 'Your community access has been removed', 'Tu acceso a la comunidad fue removido')}</p>
          <p style={{ margin: 0, fontSize: 14, color: T.muted, lineHeight: 1.5 }}>{L('Um administrador bloqueou seu acesso à comunidade. Se achar que foi engano, fale com o suporte.', 'An administrator blocked your access to the community. If you think this was a mistake, contact support.', 'Un administrador bloqueó tu acceso a la comunidad. Si crees que fue un error, habla con el soporte.')}</p>
        </div>
      )
    }
    return (
      <div style={{ ...card, textAlign: 'center', padding: '32px 20px' }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>🔒</div>
        <p style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: T.text }}>{L('A Comunidade é dos membros pagantes', 'The Community is for paying members', 'La Comunidad es para miembros de pago')}</p>
        <p style={{ margin: '0 0 14px', fontSize: 14, color: T.muted, lineHeight: 1.5 }}>{L('Assine um plano do CRM ou compre créditos de lead pra trocar ideias, ver vitórias e aprender com quem fecha.', 'Subscribe to a CRM plan or buy lead credits to swap ideas, see wins, and learn from those who close.', 'Suscríbete a un plan del CRM o compra créditos de leads para intercambiar ideas, ver victorias y aprender de los que cierran.')}</p>
        <a href="/dashboard/credits" style={{ ...btn, display: 'inline-block', textDecoration: 'none' }}>{L('Ver planos e créditos', 'See plans and credits', 'Ver planes y créditos')}</a>
      </div>
    )
  }

  return (
    <div>
      {/* perfil + mensagens + sino */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10, position: 'relative' }}>
        <button onClick={openMembers} aria-label={L('integrantes', 'members', 'integrantes')} title={L('Integrantes da comunidade', 'Community members', 'Integrantes de la comunidad')} style={{ border: `1px solid ${T.border}`, background: T.card, borderRadius: 999, width: 38, height: 38, cursor: 'pointer', fontSize: 16 }}>
          👥
        </button>
        <button onClick={openProfileEdit} aria-label={L('meu perfil', 'my profile', 'mi perfil')} title={L('Meu perfil', 'My profile', 'Mi perfil')} style={{ border: `1px solid ${T.border}`, background: T.card, borderRadius: 999, width: 38, height: 38, cursor: 'pointer', fontSize: 16, padding: 0, overflow: 'hidden' }}>
          {myProfile?.avatar_path ? <img src={`/api/community/image?path=${encodeURIComponent(myProfile.avatar_path)}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : '👤'}
        </button>
        <button onClick={() => { setDmActive(null); setDmOpen(true); loadDmList() }} aria-label={L('mensagens', 'messages', 'mensajes')} style={{ position: 'relative', border: `1px solid ${T.border}`, background: T.card, borderRadius: 999, width: 38, height: 38, cursor: 'pointer', fontSize: 16 }}>
          ✉️
          {dmUnread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: 'var(--bg-card)', borderRadius: 999, minWidth: 18, height: 18, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{dmUnread > 9 ? '9+' : dmUnread}</span>}
        </button>
        <button onClick={openNotifs} aria-label={L('notificações', 'notifications', 'notificaciones')} style={{ position: 'relative', border: `1px solid ${T.border}`, background: T.card, borderRadius: 999, width: 38, height: 38, cursor: 'pointer', fontSize: 17 }}>
          🔔
          {unread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: 'var(--bg-card)', borderRadius: 999, minWidth: 18, height: 18, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{unread > 9 ? '9+' : unread}</span>}
        </button>
        {notifOpen && (
          <div style={{ position: 'absolute', top: 44, right: 0, width: 300, maxHeight: 360, overflowY: 'auto', background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, zIndex: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
            <p style={{ margin: 0, padding: '10px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.text }}>{L('Notificações', 'Notifications', 'Notificaciones')}</p>
            {notifs.length === 0 ? (
              <p style={{ margin: 0, padding: '18px 14px', fontSize: 13, color: T.muted, textAlign: 'center' }}>{L('Nada por aqui ainda.', 'Nothing here yet.', 'Nada por aquí todavía.')}</p>
            ) : notifs.map(n => (
              <div key={n.id} style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: bodyColor, background: n.read ? 'transparent' : T.accentBg }}>
                <span style={{ fontWeight: 600, color: T.text }}>{n.actor_name || L('Alguém', 'Someone', 'Alguien')}</span> {n.type === 'comment' ? L('comentou no seu post', 'commented on your post', 'comentó en tu publicación') : n.type === 'mention' ? L('mencionou você', 'mentioned you', 'te mencionó') : n.type === 'aviso' ? L('publicou um aviso 📢', 'posted an announcement 📢', 'publicó un aviso 📢') : L('reagiu no seu post', 'reacted to your post', 'reaccionó a tu publicación')}{n.preview ? `: “${n.preview}”` : ''}
                <span style={{ display: 'block', color: T.muted, fontSize: 11, marginTop: 2 }}>{ago(n.created_at, t._locale)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* canais */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
        {([['', L('Tudo', 'All', 'Todo')], ['avisos', `📢 ${CHANNEL_LABEL.avisos}`], ['fechamento', CHANNEL_LABEL.fechamento], ['follow_up', CHANNEL_LABEL.follow_up], ['vitorias', CHANNEL_LABEL.vitorias]] as [string, string][]).map(([v, label]) => (
          <span key={v} style={chip(channel === v)} onClick={() => setChannel(v as any)}>{label}</span>
        ))}
      </div>

      {/* ordenar + buscar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={chip(sort === 'recent')} onClick={() => setSort('recent')}>{L('Recentes', 'Recent', 'Recientes')}</span>
        <span style={chip(sort === 'top')} onClick={() => setSort('top')}>{L('🔥 Em alta', '🔥 Trending', '🔥 En tendencia')}</span>
        <input style={{ ...inputStyle, flex: 1, minWidth: 150 }} placeholder={L('Buscar na comunidade…', 'Search the community…', 'Buscar en la comunidad…')} value={searchInput} onChange={e => setSearchInput(e.target.value)} />
      </div>

      {/* ranking do mês */}
      {ranking.length > 0 && (
        <div style={card}>
          <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: T.text }}>{L('🏆 Top fechadores do mês', '🏆 Top closers of the month', '🏆 Top cerradores del mes')}</p>
          {ranking.slice(0, 5).map((r, i) => (
            <div key={r.buyer_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
              <span style={{ width: 20, fontSize: 13, fontWeight: 700, color: i === 0 ? '#f59e0b' : i === 1 ? 'var(--fg-muted)' : i === 2 ? '#b45309' : T.muted }}>{L(`${i + 1}º`, `#${i + 1}`, `${i + 1}º`)}</span>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(r.name)}</div>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>{r.count} {r.count === 1 ? L('venda', 'sale', 'venta') : L('vendas', 'sales', 'ventas')}{r.total > 0 ? ` · ${money(r.total)}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {err && (
        <div style={{ ...card, marginBottom: 12, padding: '10px 14px', background: dark ? '#2a1416' : 'var(--err-soft)', border: `1px solid ${dark ? '#5b2326' : 'var(--err-line)'}`, color: '#ef4444', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>{err}</span>
          <span style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => setErr('')}>✕</span>
        </div>
      )}

      {/* compositor */}
      {!open ? (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Av name={me?.name} path={myProfile?.avatar_path} size={36} bg={T.accentBg} fg={T.accent} />
          <button style={{ flex: 1, textAlign: 'left', background: T.input, border: `1px solid ${T.border}`, borderRadius: 999, padding: '9px 14px', color: T.muted, fontSize: 14, cursor: 'pointer' }} onClick={() => { setCkind('post'); setOpen(true) }}>{L('Compartilhe uma vitória ou tire uma dúvida…', 'Share a win or ask a question…', 'Comparte una victoria o haz una pregunta…')}</button>
          <button style={{ ...btn, padding: '9px 13px', whiteSpace: 'nowrap' }} onClick={() => { setCkind('win'); setOpen(true) }}>{L('🏆 Venda', '🏆 Sale', '🏆 Venta')}</button>
        </div>
      ) : (
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {([['win', L('🏆 Vitória', '🏆 Win', '🏆 Victoria')], ['post', L('💬 Pergunta', '💬 Question', '💬 Pregunta')], ['poll', L('📊 Enquete', '📊 Poll', '📊 Encuesta')], ...(me?.isAdmin ? [['sacada', L('💡 Sacada', '💡 Insight', '💡 Tip')], ['aviso', L('📢 Aviso', '📢 Announcement', '📢 Aviso')]] : [])] as [Kind, string][]).map(([k, label]) => (
              <span key={k} style={chip(ckind === k)} onClick={() => setCkind(k)}>{label}</span>
            ))}
          </div>

          {ckind === 'win' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 10 }}>
                <input style={inputStyle} placeholder={L('Valor da venda ($/ano)', 'Sale value ($/yr)', 'Valor de la venta ($/año)')} value={csale} onChange={e => setCsale(e.target.value)} inputMode="numeric" />
                <input style={inputStyle} placeholder={L('Idade do lead (dias)', 'Lead age (days)', 'Edad del lead (días)')} value={cage} onChange={e => setCage(e.target.value)} inputMode="numeric" />
                <input style={inputStyle} placeholder={L('Produto (ex: Vida)', 'Product (e.g. Life)', 'Producto (ej: Vida)')} value={cproduct} onChange={e => setCproduct(e.target.value)} />
              </div>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} placeholder={L('O que funcionou? (opcional)', 'What worked? (optional)', '¿Qué funcionó? (opcional)')} value={cbody} onChange={e => setCbody(e.target.value)} />
            </>
          ) : ckind === 'poll' ? (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {(['fechamento', 'follow_up', 'geral'] as Channel[]).map(c => (
                  <span key={c} style={chip(cchannel === c)} onClick={() => setCchannel(c)}>{CHANNEL_LABEL[c]}</span>
                ))}
              </div>
              <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical', marginBottom: 10 }} placeholder={L('Pergunta da enquete…', 'Poll question…', 'Pregunta de la encuesta…')} value={cbody} onChange={e => setCbody(e.target.value)} />
              {cpoll.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input style={inputStyle} placeholder={L(`Opção ${i + 1}`, `Option ${i + 1}`, `Opción ${i + 1}`)} value={opt} onChange={e => setCpoll(prev => prev.map((o, j) => j === i ? e.target.value : o))} />
                  {cpoll.length > 2 && <button onClick={() => setCpoll(prev => prev.filter((_, j) => j !== i))} style={{ ...ghostBtn, padding: '0 11px' }}>✕</button>}
                </div>
              ))}
              {cpoll.length < 4 && <button onClick={() => setCpoll(prev => [...prev, ''])} style={{ ...ghostBtn, fontSize: 12, padding: '6px 11px' }}>{L('+ opção', '+ option', '+ opción')}</button>}
            </>
          ) : (
            <>
              {ckind !== 'aviso' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  {(['fechamento', 'follow_up', 'geral'] as Channel[]).map(c => (
                    <span key={c} style={chip(cchannel === c)} onClick={() => setCchannel(c)}>{CHANNEL_LABEL[c]}</span>
                  ))}
                </div>
              )}
              <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder={ckind === 'aviso' ? L('Escreva o aviso oficial pra comunidade…', 'Write the official announcement for the community…', 'Escribe el aviso oficial para la comunidad…') : ckind === 'sacada' ? L('Sua sacada da semana…  (use @nome pra mencionar)', 'Your insight of the week…  (use @name to mention)', 'Tu tip de la semana…  (usa @nombre para mencionar)') : L('Sua pergunta ou comentário…  (use @nome pra mencionar)', 'Your question or comment…  (use @name to mention)', 'Tu pregunta o comentario…  (usa @nombre para mencionar)')} value={cbody} onChange={e => setCbody(e.target.value)} />
            </>
          )}

          {/* anexar imagem */}
          <div style={{ marginTop: 10 }}>
            {cpreview ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={cpreview} alt="" style={{ maxHeight: 130, maxWidth: '100%', borderRadius: 10, border: `1px solid ${T.border}`, display: 'block' }} />
                {cuploading && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 13, borderRadius: 10 }}>{L('enviando…', 'uploading…', 'subiendo…')}</span>}
                <button onClick={clearImage} aria-label={L('remover imagem', 'remove image', 'quitar imagen')} style={{ position: 'absolute', top: 5, right: 5, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 999, width: 22, height: 22, cursor: 'pointer', fontSize: 12, lineHeight: '22px', padding: 0 }}>✕</button>
              </div>
            ) : (
              <label style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                🖼️ {L('Imagem', 'Image', 'Imagen')}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.currentTarget.value = '' }} />
              </label>
            )}
            {cvideoUploading ? (
              <span style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>{L('⏳ Enviando vídeo… (pode demorar)', '⏳ Uploading video… (may take a while)', '⏳ Subiendo video… (puede tardar)')}</span>
            ) : cvideo ? (
              <span style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                🎥 {cvideoName.slice(0, 26) || L('vídeo anexado', 'video attached', 'video adjunto')}
                <span onClick={clearVideo} style={{ cursor: 'pointer', fontWeight: 700 }}>✕</span>
              </span>
            ) : (
              <label style={{ ...ghostBtn, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                🎥 {L('Vídeo', 'Video', 'Video')}
                <input type="file" accept="video/mp4,video/quicktime,video/webm" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadVideo(f); e.currentTarget.value = '' }} />
              </label>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button style={ghostBtn} onClick={() => { resetComposer(); setErr('') }}>{L('Cancelar', 'Cancel', 'Cancelar')}</button>
            <button style={{ ...btn, opacity: (posting || cuploading || cvideoUploading) ? 0.6 : 1 }} onClick={submit} disabled={posting || cuploading || cvideoUploading}>{posting ? L('Publicando…', 'Publishing…', 'Publicando…') : cvideoUploading ? L('Aguardando vídeo…', 'Waiting for video…', 'Esperando el video…') : L('Publicar', 'Publish', 'Publicar')}</button>
          </div>
        </div>
      )}

      {/* feed */}
      {loading ? (
        <p style={{ color: T.muted, fontSize: 14, padding: '20px 0', textAlign: 'center' }}>{L('Carregando…', 'Loading…', 'Cargando…')}</p>
      ) : needsMigration ? (
        <div style={{ ...card, color: T.muted, fontSize: 13 }}>{L('A tabela da comunidade ainda não foi criada. Rode ', 'The community table has not been created yet. Run ', 'La tabla de la comunidad aún no fue creada. Ejecuta ')}<code>supabase/migrations/022_community.sql</code>{L(' no Supabase.', ' in Supabase.', ' en Supabase.')}</div>
      ) : posts.length === 0 ? (
        err ? null : (
          <div style={{ ...card, textAlign: 'center', padding: '28px 20px', color: T.muted }}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>🤝</div>
            <p style={{ margin: 0, fontSize: 14 }}>{L('Ainda não tem nada por aqui. Seja o primeiro a compartilhar uma vitória.', 'Nothing here yet. Be the first to share a win.', 'Todavía no hay nada por aquí. Sé el primero en compartir una victoria.')}</p>
          </div>
        )
      ) : posts.map(p => {
        const pollTotal = Object.values(p.poll_counts || {}).reduce((a, b) => a + b, 0)
        return (
          <div key={p.id} style={p.kind === 'aviso' ? { ...card, border: '1.5px solid #f59e0b', background: dark ? '#241a06' : 'var(--warn-soft)' } : card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Av name={p.author_name} path={p.author_avatar} size={36} bg={p.kind === 'win' ? T.winBg : T.accentBg} fg={p.kind === 'win' ? T.winText : T.accent} onClick={p.buyer_id ? () => setProfileId(p.buyer_id) : undefined} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p onClick={() => p.buyer_id && setProfileId(p.buyer_id)} style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text, cursor: p.buyer_id ? 'pointer' : 'default' }}>{p.author_name || L('Membro', 'Member', 'Miembro')}</p>
                <p style={{ margin: 0, fontSize: 12, color: T.muted }}>{p.pinned && '📌 '}{ago(p.created_at, t._locale)}</p>
              </div>
              {p.kind === 'win' && <span style={{ background: T.winBg, color: T.winText, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999 }}>{L('🏆 vitória', '🏆 win', '🏆 victoria')}</span>}
              {p.kind === 'sacada' && <span style={{ background: T.accentBg, color: T.accent, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999 }}>{L('💡 sacada', '💡 insight', '💡 tip')}</span>}
              {p.kind === 'poll' && <span style={{ background: T.accentBg, color: T.accent, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 999 }}>{L('📊 enquete', '📊 poll', '📊 encuesta')}</span>}
              {p.kind === 'aviso' && <span style={{ background: 'var(--warn-line)', color: '#b45309', fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }}>{L('📢 aviso', '📢 announcement', '📢 aviso')}</span>}
              {p.kind === 'post' && <span style={{ background: T.tag, color: T.muted, fontSize: 12, padding: '3px 9px', borderRadius: 999 }}>{CHANNEL_LABEL[p.channel]}</span>}
            </div>

            {p.title && <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: T.text }}>{p.title}</p>}
            {editingId === p.id ? (
              <div style={{ marginBottom: 10 }}>
                <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={editDraft} onChange={e => setEditDraft(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                  <button style={ghostBtn} onClick={() => setEditingId(null)}>{L('Cancelar', 'Cancel', 'Cancelar')}</button>
                  <button style={btn} onClick={() => saveEdit(p)}>{L('Salvar', 'Save', 'Guardar')}</button>
                </div>
              </div>
            ) : (
              p.body && <p style={{ margin: '0 0 10px', fontSize: 14, color: bodyColor, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{renderBody(p.body, T.accent)}</p>
            )}

            {p.data?.video_path && (
              <video controls preload="metadata" playsInline
                src={`/api/community/image?path=${encodeURIComponent(p.data.video_path)}`}
                style={{ width: '100%', maxHeight: 480, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 10, display: 'block', background: '#000' }} />
            )}
            {p.data?.image_path && (
              <img src={`/api/community/image?path=${encodeURIComponent(p.data.image_path)}`} alt="" loading="lazy" style={{ width: '100%', height: 'auto', borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 10, display: 'block' }} />
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
                <p style={{ margin: '2px 0 0', fontSize: 11, color: T.muted }}>{pollTotal} {pollTotal === 1 ? L('voto', 'vote', 'voto') : L('votos', 'votes', 'votos')}</p>
              </div>
            )}

            {p.kind === 'win' && (p.data?.sale_value || p.data?.lead_age_days || p.data?.product) && (
              <div style={{ background: T.winBg, borderRadius: 10, padding: '11px 14px', display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10 }}>
                {p.data.sale_value ? <div><p style={{ margin: 0, fontSize: 11, color: T.win }}>{L('Venda', 'Sale', 'Venta')}</p><p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.winText }}>{money(p.data.sale_value)}</p></div> : null}
                {p.data.lead_age_days != null ? <div><p style={{ margin: 0, fontSize: 11, color: T.win }}>{L('Idade do lead', 'Lead age', 'Edad del lead')}</p><p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.winText }}>{p.data.lead_age_days} {p.data.lead_age_days === 1 ? L('dia', 'day', 'día') : L('dias', 'days', 'días')}</p></div> : null}
                {p.data.product ? <div><p style={{ margin: 0, fontSize: 11, color: T.win }}>{L('Produto', 'Product', 'Producto')}</p><p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.winText }}>{p.data.product}</p></div> : null}
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
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: T.muted, padding: '4px 4px', fontSize: 13, fontWeight: 600 }}>💬 {p.comment_count > 0 ? p.comment_count : ''}</span>
              <div style={{ flex: 1 }} />
              {me?.isAdmin && <button style={{ ...ghostBtn, padding: '4px 9px', fontSize: 12 }} onClick={() => pin(p)}>{p.pinned ? L('Desafixar', 'Unpin', 'Desfijar') : L('Fixar', 'Pin', 'Fijar')}</button>}
              {p.can_delete && editingId !== p.id && <button style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: T.muted, fontSize: 12, padding: '4px 6px' }} onClick={() => { setEditingId(p.id); setEditDraft(p.body || '') }}>{L('Editar', 'Edit', 'Editar')}</button>}
              {p.can_delete && <button style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: T.muted, fontSize: 12, padding: '4px 6px' }} onClick={() => del(p)}>{L('Excluir', 'Delete', 'Eliminar')}</button>}
            </div>

            {/* Comentários SEMPRE visíveis (sem clique) */}
            <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
              {(comments[p.id] || []).filter(c => !c.parent_id).map(c => (
                <div key={c.id}>
                  {renderComment(c, p, false)}
                  {(comments[p.id] || []).filter(rc => rc.parent_id === c.id).map(rc => renderComment(rc, p, true))}
                </div>
              ))}
              {replyTo?.postId === p.id && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: T.muted, marginBottom: 6 }}>
                  <span>{L('respondendo a', 'replying to', 'respondiendo a')} <span style={{ fontWeight: 600, color: T.text }}>{replyTo.name}</span></span>
                  <span style={{ cursor: 'pointer' }} onClick={() => setReplyTo(null)}>✕</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input style={{ ...inputStyle, flex: 1 }} placeholder={replyTo?.postId === p.id ? L(`Responder a ${replyTo.name}…`, `Reply to ${replyTo.name}…`, `Responder a ${replyTo.name}…`) : L('Escreva um comentário…  (use @nome)', 'Write a comment…  (use @name)', 'Escribe un comentario…  (usa @nombre)')} value={drafts[p.id] || ''} onChange={e => setDrafts(prev => ({ ...prev, [p.id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addComment(p) }} />
                <button style={btn} onClick={() => addComment(p)}>{L('Enviar', 'Send', 'Enviar')}</button>
              </div>
            </div>
          </div>
        )
      })}

      {profileId && (
        <div onClick={() => setProfileId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <Av name={profile?.name} path={profile?.avatar_path} size={48} bg={T.accentBg} fg={T.accent} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.text }}>{profile?.name || '…'}</p>
                {profile?.stats && <p style={{ margin: 0, fontSize: 12, color: T.muted }}>{profile.stats.posts} {profile.stats.posts === 1 ? 'post' : 'posts'} · {profile.stats.wins} {profile.stats.wins === 1 ? L('vitória', 'win', 'victoria') : L('vitórias', 'wins', 'victorias')}{profile.stats.salesTotal > 0 ? ` · ${money(profile.stats.salesTotal)} ${L('vendidos', 'sold', 'vendidos')}` : ''}</p>}
              </div>
              {profileId && me && profileId !== me.id && <button onClick={() => openConversation(profileId, profile?.name || L('Membro', 'Member', 'Miembro'))} style={{ ...btn, padding: '6px 12px' }}>{L('Mensagem', 'Message', 'Mensaje')}</button>}
              {me?.isAdmin && profileId !== me.id && <button onClick={() => toggleBan(profileId!, !!profile?.banned)} style={{ ...ghostBtn, padding: '6px 11px', color: profile?.banned ? T.accent : '#ef4444', borderColor: profile?.banned ? T.border : 'var(--err-line)' }}>{profile?.banned ? L('↺ Desbloquear', '↺ Unblock', '↺ Desbloquear') : L('🚫 Bloquear', '🚫 Block', '🚫 Bloquear')}</button>}
              <button onClick={() => setProfileId(null)} style={{ ...ghostBtn, padding: '6px 11px' }}>{L('Fechar', 'Close', 'Cerrar')}</button>
            </div>
            {profile?.bio && <p style={{ margin: '0 0 12px', fontSize: 13.5, color: bodyColor, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{profile.bio}</p>}
            {!profile ? (
              <p style={{ color: T.muted, fontSize: 13, textAlign: 'center', padding: '14px 0' }}>{L('Carregando…', 'Loading…', 'Cargando…')}</p>
            ) : (profile.posts || []).length === 0 ? (
              <p style={{ color: T.muted, fontSize: 13, textAlign: 'center', padding: '14px 0' }}>{L('Ainda não postou nada.', 'No posts yet.', 'Todavía no publicó nada.')}</p>
            ) : (profile.posts || []).map((pp: any) => (
              <div key={pp.id} style={{ borderTop: `1px solid ${T.border}`, padding: '10px 0' }}>
                <p style={{ margin: '0 0 3px', fontSize: 12, color: T.muted }}>{pp.kind === 'win' ? L('🏆 vitória', '🏆 win', '🏆 victoria') : pp.kind === 'sacada' ? L('💡 sacada', '💡 insight', '💡 tip') : pp.kind === 'poll' ? L('📊 enquete', '📊 poll', '📊 encuesta') : (CHANNEL_LABEL[pp.channel as Channel] || 'post')} · {ago(pp.created_at, t._locale)}</p>
                {pp.body && <p style={{ margin: 0, fontSize: 13, color: bodyColor, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{pp.body}</p>}
                {pp.kind === 'win' && pp.data?.sale_value ? <p style={{ margin: '2px 0 0', fontSize: 12, color: T.win, fontWeight: 600 }}>{money(pp.data.sale_value)}{pp.data.product ? ` · ${pp.data.product}` : ''}</p> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {membersOpen && (
        <div onClick={() => setMembersOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 58, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, display: 'flex', flexDirection: 'column', maxHeight: '78vh', overflow: 'hidden', marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${T.border}` }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text, flex: 1 }}>👥 {L('Integrantes', 'Members', 'Integrantes')} {members.length > 0 && <span style={{ color: T.muted, fontWeight: 600, fontSize: 13 }}>· {members.length}</span>}</p>
              <button onClick={() => setMembersOpen(false)} style={{ ...ghostBtn, padding: '5px 10px' }}>{L('Fechar', 'Close', 'Cerrar')}</button>
            </div>
            <div style={{ padding: '10px 16px 0' }}>
              <input style={{ ...inputStyle }} placeholder={L('Buscar integrante…', 'Search members…', 'Buscar integrante…')} value={memberSearch} onChange={e => setMemberSearch(e.target.value)} />
            </div>
            <div style={{ overflowY: 'auto', padding: '8px 16px 14px' }}>
              {membersLoading ? (
                <p style={{ color: T.muted, fontSize: 13, textAlign: 'center', padding: '18px 0' }}>{L('Carregando…', 'Loading…', 'Cargando…')}</p>
              ) : members.filter(m => !memberSearch.trim() || m.name.toLowerCase().includes(memberSearch.trim().toLowerCase())).map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${T.border}` }}>
                  <Av name={m.name} path={m.avatar_path} size={38} bg={T.accentBg} fg={T.accent} onClick={() => { setMembersOpen(false); setProfileId(m.id) }} />
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => { setMembersOpen(false); setProfileId(m.id) }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {m.name}
                      {m.isAdmin && <span style={{ background: T.accentBg, color: T.accent, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>ADMIN</span>}
                      {me && m.id === me.id && <span style={{ background: T.tag, color: T.muted, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>{L('você', 'you', 'tú')}</span>}
                    </p>
                    {m.bio && <p style={{ margin: 0, fontSize: 12, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.bio}</p>}
                  </div>
                  {me && m.id !== me.id && (
                    <button onClick={() => { setMembersOpen(false); openConversation(m.id, m.name) }} style={{ ...ghostBtn, padding: '6px 11px', whiteSpace: 'nowrap' }}>💬 {L('Mensagem', 'Message', 'Mensaje')}</button>
                  )}
                </div>
              ))}
              {!membersLoading && members.length > 0 && members.filter(m => !memberSearch.trim() || m.name.toLowerCase().includes(memberSearch.trim().toLowerCase())).length === 0 && (
                <p style={{ color: T.muted, fontSize: 13, textAlign: 'center', padding: '18px 0' }}>{L('Ninguém com esse nome.', 'No one with that name.', 'Nadie con ese nombre.')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {profileEdit && (
        <div onClick={() => setProfileEdit(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, marginBottom: 40 }}>
            <p style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: T.text }}>{L('Meu perfil', 'My profile', 'Mi perfil')}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              {peAvatar ? (
                <img src={`/api/community/image?path=${encodeURIComponent(peAvatar)}`} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${T.border}`, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, flexShrink: 0 }}>{initials(peName || me?.name)}</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ ...ghostBtn, padding: '7px 12px', cursor: 'pointer', textAlign: 'center' as const }}>
                  {peUploading ? L('Enviando…', 'Uploading…', 'Subiendo…') : L('📷 Trocar foto', '📷 Change photo', '📷 Cambiar foto')}
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = '' }} />
                </label>
                {peAvatar && <button onClick={() => setPeAvatar('')} style={{ ...ghostBtn, padding: '7px 12px', color: '#ef4444' }}>{L('Remover foto', 'Remove photo', 'Quitar foto')}</button>}
              </div>
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 4 }}>{L('Nome', 'Name', 'Nombre')}</label>
            <input style={{ ...inputStyle, marginBottom: 10 }} value={peName} onChange={e => setPeName(e.target.value)} maxLength={60} />
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 4 }}>{L('Bio — conte quem você é', 'Bio — tell us who you are', 'Bio — cuenta quién eres')}</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' as const, marginBottom: 4 }} placeholder={L('Ex: Agente em Orlando/FL, foco em seguro de vida e IUL. Conta sua história, sua região e seu diferencial.', 'E.g. agent in Orlando/FL focused on life insurance and IUL. Share your story, your area, and what sets you apart.', 'Ej: Agente en Orlando/FL, enfocado en seguro de vida e IUL. Cuenta tu historia, tu región y tu diferencial.')} value={peBio} onChange={e => setPeBio(e.target.value)} maxLength={300} />
            <p style={{ margin: '0 0 12px', fontSize: 11, color: T.muted, textAlign: 'right' }}>{peBio.length}/300</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setProfileEdit(false)} style={ghostBtn}>{L('Cancelar', 'Cancel', 'Cancelar')}</button>
              <button onClick={saveProfile} disabled={peSaving || peUploading} style={{ ...btn, opacity: peSaving || peUploading ? 0.6 : 1 }}>{peSaving ? L('Salvando…', 'Saving…', 'Guardando…') : L('Salvar perfil', 'Save profile', 'Guardar perfil')}</button>
            </div>
          </div>
        </div>
      )}

      {dmOpen && (
        <div onClick={() => { setDmOpen(false); setDmActive(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 55, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, display: 'flex', flexDirection: 'column', maxHeight: '78vh', overflow: 'hidden' }}>
            {dmActive ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
                  <button onClick={() => { setDmActive(null); loadDmList() }} style={{ ...ghostBtn, padding: '4px 11px' }}>←</button>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dmActive.name}</p>
                  <button onClick={() => { setDmOpen(false); setDmActive(null) }} style={{ ...ghostBtn, padding: '4px 10px' }}>{L('Fechar', 'Close', 'Cerrar')}</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 220 }}>
                  {dmMessages.length === 0 ? (
                    <p style={{ color: T.muted, fontSize: 13, textAlign: 'center', margin: 'auto' }}>{L('Sem mensagens ainda. Diga oi 👋', 'No messages yet. Say hi 👋', 'Sin mensajes todavía. Di hola 👋')}</p>
                  ) : dmMessages.map(m => (
                    <div key={m.id} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '78%', background: m.mine ? T.accent : T.tag, color: m.mine ? '#ffffff' : T.text, borderRadius: 12, padding: '7px 11px', fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${T.border}` }}>
                  <input style={{ ...inputStyle, flex: 1 }} placeholder={L('Mensagem…', 'Message…', 'Mensaje…')} value={dmDraft} onChange={e => setDmDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendDm() }} />
                  <button style={btn} onClick={sendDm}>{L('Enviar', 'Send', 'Enviar')}</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>{L('Mensagens', 'Messages', 'Mensajes')}</p>
                  <button onClick={() => setDmOpen(false)} style={{ ...ghostBtn, padding: '4px 10px' }}>{L('Fechar', 'Close', 'Cerrar')}</button>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: '62vh' }}>
                  {dmConvs.length === 0 ? (
                    <p style={{ color: T.muted, fontSize: 13, textAlign: 'center', padding: '24px 16px', lineHeight: 1.5 }}>{L('Nenhuma conversa ainda.', 'No conversations yet.', 'Ninguna conversación todavía.')}<br />{L('Abra o perfil de um membro e toque em “Mensagem”.', 'Open a member’s profile and tap “Message”.', 'Abre el perfil de un miembro y toca “Mensaje”.')}</p>
                  ) : dmConvs.map(c => (
                    <div key={c.otherId} onClick={() => openConversation(c.otherId, c.name)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: T.accentBg, color: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials(c.name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text }}>{c.name}</p>
                        <p style={{ margin: 0, fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last}</p>
                      </div>
                      {c.unread > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 999, minWidth: 18, height: 18, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{c.unread}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
