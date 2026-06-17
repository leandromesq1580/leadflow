'use client'

import { useState, useEffect, useRef, useMemo } from 'react'

interface Conversation {
  buyer_id: string; name: string; email: string; phone: string; crm_plan: string
  last_body: string; last_direction: 'in' | 'out'; last_at: string; unread: number
}
interface Msg { id: string; direction: 'in' | 'out'; body: string | null; media_type?: string | null; media_url?: string | null; created_at: string; status: string }

const PLAN_LABEL: Record<string, string> = { pro: '⚡ CRM Pro', appointment: '📅 Appointment', lead_only: '🎯 Lead Only', free: 'Free' }

function initials(n: string) { return n.split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '??' }
function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'agora'; if (m < 60) return `${m}m`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`
  const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function ClientsInbox() {
  const [convs, setConvs] = useState<Conversation[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  async function loadConvs() {
    const r = await fetch('/api/admin/clients/conversations')
    if (r.ok) { const d = await r.json(); setConvs(d.conversations || []); setSel(prev => prev || d.conversations?.[0]?.buyer_id || null) }
  }
  async function loadMsgs(bid: string) {
    const r = await fetch(`/api/admin/clients/messages?buyer_id=${bid}`)
    if (r.ok) { const d = await r.json(); setMsgs(d.messages || []) }
    fetch('/api/admin/clients/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buyer_id: bid }) }).catch(() => {})
  }

  useEffect(() => { loadConvs(); const t = setInterval(loadConvs, 10000); return () => clearInterval(t) }, [])
  useEffect(() => { if (sel) { loadMsgs(sel); const t = setInterval(() => loadMsgs(sel), 6000); return () => clearInterval(t) } }, [sel])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])

  async function send() {
    if (!text.trim() || !sel || sending) return
    setSending(true)
    const r = await fetch('/api/admin/clients/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buyer_id: sel, body: text.trim() }) })
    setSending(false)
    if (r.ok) { setText(''); loadMsgs(sel); loadConvs() }
    else { const d = await r.json().catch(() => ({})); alert(d.error || 'Falha ao enviar') }
  }

  const filtered = useMemo(() => !search.trim() ? convs : convs.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)), [convs, search])
  const current = convs.find(c => c.buyer_id === sel) || null

  return (
    <div className="rounded-2xl overflow-hidden flex" style={{ background: '#fff', border: '1px solid #e8ecf4', height: 'calc(100vh - 230px)', minHeight: 480 }}>
      {/* Lista */}
      <div className="w-[320px] flex flex-col" style={{ borderRight: '1px solid #e8ecf4' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #e8ecf4' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente…"
            className="w-full px-3 py-2 rounded-lg text-[12px] focus:outline-none" style={{ background: '#f8fafc', border: '1px solid #e8ecf4' }} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-[30px] mb-2">👥</p>
              <p className="text-[13px] font-semibold" style={{ color: '#64748b' }}>Nenhuma conversa</p>
              <p className="text-[11px] mt-1" style={{ color: '#94a3b8' }}>Quando um cliente escrever, aparece aqui.</p>
            </div>
          ) : filtered.map(c => {
            const active = c.buyer_id === sel
            return (
              <button key={c.buyer_id} onClick={() => setSel(c.buyer_id)}
                className="w-full text-left px-4 py-3 flex items-start gap-3"
                style={{ background: active ? '#eef2ff' : 'transparent', borderBottom: '1px solid #f1f5f9', borderLeft: active ? '3px solid #6366f1' : '3px solid transparent' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-extrabold text-white flex-shrink-0" style={{ background: `hsl(${(c.name.charCodeAt(0) * 47) % 360}, 55%, 50%)` }}>{initials(c.name)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-bold truncate" style={{ color: '#1a1a2e' }}>{c.name}</p>
                    <span className="text-[10px] flex-shrink-0" style={{ color: '#94a3b8' }}>{timeAgo(c.last_at)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-[11px] truncate flex-1" style={{ color: c.unread > 0 ? '#1a1a2e' : '#94a3b8', fontWeight: c.unread > 0 ? 600 : 400 }}>
                      {c.last_direction === 'out' && '✓ '}{c.last_body}
                    </p>
                    {c.unread > 0 && <span className="text-[10px] font-extrabold text-white rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#6366f1', minWidth: 18, height: 18, padding: '0 5px' }}>{c.unread}</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 flex flex-col">
        {current ? (
          <>
            <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid #e8ecf4' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-extrabold text-white" style={{ background: `hsl(${(current.name.charCodeAt(0) * 47) % 360}, 55%, 50%)` }}>{initials(current.name)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>{current.name}</p>
                <div className="flex items-center gap-2 text-[11px]" style={{ color: '#64748b' }}>
                  <span>{current.phone}</span><span>·</span>
                  <span className="font-bold px-1.5 py-0.5 rounded" style={{ background: '#eef2ff', color: '#6366f1' }}>{PLAN_LABEL[current.crm_plan] || current.crm_plan}</span>
                </div>
              </div>
              <a href={`/admin/buyers`} className="text-[11px] font-bold px-3 py-1.5 rounded-lg" style={{ background: '#f1f5f9', color: '#475569' }}>Ver perfil</a>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ background: '#f8f9fc' }}>
              {msgs.length === 0 && <p className="text-center text-[12px] py-10" style={{ color: '#94a3b8' }}>Sem mensagens nessa conversa ainda.</p>}
              {msgs.map(m => (
                <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[78%] px-3 py-2 rounded-2xl" style={{ background: m.direction === 'out' ? '#dcf8c6' : '#fff', border: m.direction === 'in' ? '1px solid #e8ecf4' : 'none' }}>
                    {m.body && <p className="text-[13px] whitespace-pre-wrap break-words" style={{ color: '#1a1a2e' }}>{m.body}</p>}
                    {!m.body && m.media_type && <p className="text-[12px] italic" style={{ color: '#64748b' }}>📎 {m.media_type}</p>}
                    <p className="text-[9px] mt-0.5 text-right" style={{ color: '#94a3b8' }}>{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="p-3 flex gap-2 items-end" style={{ borderTop: '1px solid #e8ecf4' }}>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={1}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Responder o cliente… (Enter envia)" className="flex-1 px-3 py-2 rounded-xl text-[13px] resize-none focus:outline-none" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', maxHeight: 100 }} />
              <button onClick={send} disabled={!text.trim() || sending} className="px-4 h-9 rounded-xl text-[12px] font-bold text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>{sending ? '...' : '➤'}</button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <p className="text-[42px] mb-3">👥</p>
            <p className="text-[15px] font-bold" style={{ color: '#1a1a2e' }}>Selecione um cliente</p>
            <p className="text-[12px] mt-1 max-w-xs" style={{ color: '#94a3b8' }}>As conversas com os compradores aparecem aqui, separadas dos leads.</p>
          </div>
        )}
      </div>
    </div>
  )
}
