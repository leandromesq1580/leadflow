'use client'

import { useEffect, useState, useMemo } from 'react'
import { WhatsAppInbox } from '@/components/whatsapp-inbox'
import { useT } from '@/lib/i18n-client'
import { useRealtime } from '@/lib/use-realtime'

interface Conversation {
  lead_id: string
  lead_name: string
  lead_phone: string
  lead_state: string | null
  lead_ai_score: number | null
  last_body: string
  last_direction: 'in' | 'out'
  last_sent_at: string
  unread: number
}

function timeAgoShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ontem'
  if (days < 7) return `${days}d`
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '??'
}

function hueFromName(name: string): number {
  return (name.charCodeAt(0) * 47 + (name.charCodeAt(1) || 0) * 23) % 360
}

export default function WhatsAppPage() {
  const [buyerId, setBuyerId] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const t = useT()

  useEffect(() => {
    // Auto-select lead via ?lead=X (vindo de push, card, etc)
    const params = new URLSearchParams(window.location.search)
    const urlLead = params.get('lead')
    if (urlLead) setSelectedId(urlLead)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const ref = supabaseUrl.replace('https://', '').split('.')[0]
    const cookie = document.cookie.split('; ').find(c => c.startsWith(`sb-${ref}-auth-token=`))
    if (!cookie) { setLoading(false); return }
    try {
      const token = JSON.parse(atob(cookie.split('=')[1]))
      const payload = JSON.parse(atob(token.access_token.split('.')[1]))
      fetchBuyer(payload.sub)
    } catch {
      setLoading(false)
    }
  }, [])

  async function fetchBuyer(authId: string) {
    const r = await fetch(`/api/settings?auth_user_id=${authId}`)
    const b = await r.json()
    if (b?.id) {
      setBuyerId(b.id)
      loadConversations(b.id)
    } else {
      setLoading(false)
    }
  }

  async function loadConversations(bid: string) {
    const r = await fetch(`/api/whatsapp/conversations?buyer_id=${bid}`)
    if (r.ok) {
      const d = await r.json()
      setConversations(d.conversations || [])
      // Seleciona primeira conversa se ainda não tem seleção
      setSelectedId(prev => prev || (d.conversations?.[0]?.lead_id ?? null))
    }
    setLoading(false)
  }

  // Fallback poll lento caso Realtime nao funcione
  useEffect(() => {
    if (!buyerId) return
    const t = setInterval(() => loadConversations(buyerId), 60000)
    return () => clearInterval(t)
  }, [buyerId])

  // Realtime: recarrega conversas quando chega nova msg
  useRealtime(
    'whatsapp_messages',
    'INSERT',
    buyerId ? `buyer_id=eq.${buyerId}` : null,
    () => { if (buyerId) loadConversations(buyerId) },
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.toLowerCase()
    return conversations.filter(c =>
      c.lead_name.toLowerCase().includes(q) ||
      c.lead_phone.includes(q) ||
      c.last_body.toLowerCase().includes(q)
    )
  }, [conversations, search])

  const selected = conversations.find(c => c.lead_id === selectedId) || null
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0)
  const activeCount = conversations.length

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[24px] font-extrabold" style={{ color: '#1a1a2e' }}>{t.whatsapp.title}</h1>
        <p className="text-[13px]" style={{ color: '#94a3b8' }}>
          {t.whatsapp.conversationsCount(activeCount, totalUnread)}
        </p>
      </div>

      <div className="rounded-2xl overflow-hidden flex" style={{ background: '#fff', border: '1px solid #e8ecf4', height: 'calc(100vh - 200px)', minHeight: 500 }}>
        {/* Lista de conversas */}
        <div className="w-[320px] flex flex-col" style={{ borderRight: '1px solid #e8ecf4' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #e8ecf4' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>{t.whatsapp.conversations}</p>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t.whatsapp.search}
              className="w-full px-3 py-2 rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
              style={{ background: '#f8fafc', border: '1px solid #e8ecf4' }}
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-[12px] text-center py-8" style={{ color: '#94a3b8' }}>{t.common.loading}</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 px-4">
                <p className="text-[32px] mb-2">💬</p>
                <p className="text-[13px] font-semibold" style={{ color: '#64748b' }}>
                  {search ? t.whatsapp.searchEmpty : t.whatsapp.empty}
                </p>
                <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>{t.whatsapp.emptyHelp}</p>
              </div>
            ) : (
              filtered.map(c => {
                const isActive = c.lead_id === selectedId
                const hue = hueFromName(c.lead_name)
                return (
                  <button
                    key={c.lead_id}
                    onClick={() => setSelectedId(c.lead_id)}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors"
                    style={{
                      background: isActive ? '#eef2ff' : 'transparent',
                      borderBottom: '1px solid #f1f5f9',
                      borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
                    }}
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-extrabold text-white flex-shrink-0"
                      style={{ background: `hsl(${hue}, 55%, 50%)` }}>
                      {initials(c.lead_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-bold truncate" style={{ color: '#1a1a2e' }}>{c.lead_name}</p>
                        <span className="text-[10px] font-medium flex-shrink-0" style={{ color: '#94a3b8' }}>
                          {timeAgoShort(c.last_sent_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-[11px] truncate flex-1" style={{ color: c.unread > 0 ? '#1a1a2e' : '#94a3b8', fontWeight: c.unread > 0 ? 600 : 400 }}>
                          {c.last_direction === 'out' && '✓ '}
                          {c.last_body}
                        </p>
                        {c.unread > 0 && (
                          <span className="text-[10px] font-extrabold text-white rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: '#6366f1', minWidth: 18, height: 18, padding: '0 5px' }}>
                            {c.unread > 99 ? '99+' : c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Thread do lead selecionado */}
        <div className="flex-1 flex flex-col">
          {selected ? (
            <>
              <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid #e8ecf4' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-extrabold text-white"
                  style={{ background: `hsl(${hueFromName(selected.lead_name)}, 55%, 50%)` }}>
                  {initials(selected.lead_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>{selected.lead_name}</p>
                  <div className="flex items-center gap-2 text-[11px]" style={{ color: '#64748b' }}>
                    <span>{selected.lead_phone}</span>
                    {selected.lead_state && <><span>·</span><span>{selected.lead_state}</span></>}
                    {selected.lead_ai_score != null && selected.lead_ai_score > 0 && (
                      <><span>·</span><span>🔥 AI {selected.lead_ai_score}</span></>
                    )}
                  </div>
                </div>
                <a
                  href={`/dashboard/pipeline?lead=${selected.lead_id}`}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold"
                  style={{ background: '#f1f5f9', color: '#475569' }}
                >
                  {t.whatsapp.openInPipeline}
                </a>
              </div>
              <div className="flex-1 overflow-hidden">
                <WhatsAppInbox leadId={selected.lead_id} buyerId={buyerId} />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <p className="text-[42px] mb-3">💬</p>
              <p className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>{t.whatsapp.selectChat}</p>
              <p className="text-[12px] mt-1 max-w-xs" style={{ color: '#94a3b8' }}>{t.whatsapp.selectChatHelp}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
