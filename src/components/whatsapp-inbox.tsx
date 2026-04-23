'use client'

import { useState, useEffect, useRef } from 'react'
import { useRealtime } from '@/lib/use-realtime'

interface Message {
  id: string
  direction: 'in' | 'out'
  body: string | null
  from_phone: string
  to_phone: string
  sent_at: string
  status: string
  read_at: string | null
  media_url?: string | null
  media_type?: string | null
}

interface Props {
  leadId: string
  buyerId: string
}

const QUICK_EMOJIS = [
  '😀', '😃', '😄', '😁', '😊', '🥰', '😍', '🤩', '😘', '😗',
  '🙂', '🤗', '🤔', '😐', '😑', '😶', '🙄', '😏', '😣', '😥',
  '😮', '🤐', '😯', '😪', '😫', '🥱', '😴', '😌', '😛', '😜',
  '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤥', '😶', '😐', '😑',
  '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
  '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
  '💯', '💥', '💫', '💦', '💨', '🕊️', '💬', '🗨️', '💭', '🎉',
  '🔥', '⭐', '🌟', '✨', '⚡', '☀️', '🌈', '🎁', '🎊', '🎈',
  '✅', '❌', '⚠️', '🚀', '💰', '💸', '💳', '📱', '📧', '📅',
]

const MAX_FILE_SIZE = 16 * 1024 * 1024 // 16MB

export function WhatsAppInbox({ leadId, buyerId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showEmoji, setShowEmoji] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSecs, setRecordSecs] = useState(0)
  const [micError, setMicError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    load()
    // Marca como lido e dispara evento global pras sidebars/cards reagirem ja
    fetch('/api/whatsapp/messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    })
      .then(() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('wa-unread-changed', { detail: { leadId } }))
        }
      })
      .catch(() => {})
    // Fallback poll lento
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [leadId])

  // Realtime: msg nova pro lead -> recarrega thread
  useRealtime(
    'whatsapp_messages',
    'INSERT',
    leadId ? `lead_id=eq.${leadId}` : null,
    () => load(),
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function load() {
    const r = await fetch(`/api/whatsapp/messages?lead_id=${leadId}`)
    if (r.ok) {
      const d = await r.json()
      setMessages(d.messages || [])
    }
    setLoading(false)
  }

  async function sendText() {
    if (!text.trim() || sending) return
    setSending(true)
    const r = await fetch('/api/whatsapp/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, buyer_id: buyerId, body: text.trim() }),
    })
    setSending(false)
    if (r.ok) {
      setText('')
      await load()
    } else {
      const d = await r.json()
      alert(d.error || 'Erro ao enviar')
    }
  }

  async function sendFile(file: File) {
    setMicError(null)
    if (file.size > MAX_FILE_SIZE) {
      setMicError(`Arquivo muito grande. Máximo ${MAX_FILE_SIZE / 1024 / 1024}MB.`)
      return
    }
    setSending(true)
    const form = new FormData()
    form.append('lead_id', leadId)
    form.append('buyer_id', buyerId)
    form.append('body', text.trim())
    form.append('file', file)

    const r = await fetch('/api/whatsapp/messages', { method: 'POST', body: form })
    setSending(false)
    if (r.ok) {
      setText('')
      await load()
    } else {
      const d = await r.json().catch(() => ({}))
      setMicError(d.error || `Erro ao enviar ${file.type.startsWith('audio/') ? 'audio' : 'arquivo'}. Tente de novo.`)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function startRecording() {
    setMicError(null)
    // 1) Sanity checks antes de pedir permissao
    if (typeof window === 'undefined' || !window.isSecureContext) {
      setMicError('Gravar audio precisa de HTTPS (ou localhost). Acesse pelo lead4producers.com.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('Seu navegador nao suporta gravacao de audio. Use Chrome, Edge ou Safari atualizado.')
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setMicError('MediaRecorder indisponivel nesse navegador.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // MP4/AAC tem melhor compat com whatsapp-web.js pra voice
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      recordChunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) recordChunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(recordChunksRef.current, { type: mime.split(';')[0] })
        const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'm4a' : 'ogg'
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mime.split(';')[0] })
        setRecording(false)
        if (recordTimerRef.current) clearInterval(recordTimerRef.current)
        setRecordSecs(0)
        if (file.size > 0) await sendFile(file)
      }
      rec.start()
      mediaRecorderRef.current = rec
      setRecording(true)
      setRecordSecs(0)
      recordTimerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000)
    } catch (err: any) {
      console.error('[mic] startRecording err:', err?.name, err?.message)
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setMicError('Microfone bloqueado. Clique no cadeado da barra de endereco -> Permissoes do site -> Microfone -> Permitir. Depois F5.')
      } else if (err?.name === 'NotFoundError') {
        setMicError('Nenhum microfone encontrado nesse dispositivo.')
      } else if (err?.name === 'NotReadableError') {
        setMicError('Microfone em uso por outro app. Feche Zoom/Meet/etc e tente de novo.')
      } else {
        setMicError('Falha no microfone: ' + (err?.message || err?.name || 'erro desconhecido'))
      }
    }
  }

  function stopRecording(cancel: boolean = false) {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (cancel) {
        recordChunksRef.current = []
        mediaRecorderRef.current.stop()
        // onstop ainda roda mas chunks vazios => file.size = 0 => não envia
      } else {
        mediaRecorderRef.current.stop()
      }
    }
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    setRecording(false)
    setRecordSecs(0)
  }

  function insertEmoji(emoji: string) {
    const el = textRef.current
    if (!el) { setText(t => t + emoji); return }
    const start = el.selectionStart
    const end = el.selectionEnd
    const newText = text.slice(0, start) + emoji + text.slice(end)
    setText(newText)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + emoji.length, start + emoji.length)
    }, 0)
  }

  function fmtTime(iso: string) {
    const d = new Date(iso)
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    return `${date} ${time}`
  }

  function renderMedia(m: Message) {
    // Se media_type foi classificado mas url está faltando (upload falhou no wa-bridge antigo)
    if (m.media_type && !m.media_url) {
      return (
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 mb-1"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px dashed #fecaca' }}>
          <span className="text-[16px]">⚠️</span>
          <p className="text-[11px]" style={{ color: '#dc2626' }}>
            {m.media_type === 'image' ? 'Imagem' : m.media_type === 'audio' ? 'Áudio' : m.media_type === 'video' ? 'Vídeo' : 'Arquivo'} não foi salvo (falha de upload)
          </p>
        </div>
      )
    }
    if (!m.media_url) return null
    if (m.media_type === 'image') {
      return <img src={m.media_url} alt="" className="rounded-lg max-w-full max-h-[300px] object-cover mb-1" />
    }
    if (m.media_type === 'audio') {
      return (
        <div className="rounded-lg p-2 mb-1" style={{ background: 'rgba(0,0,0,0.04)', minWidth: 240 }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[14px]">🎤</span>
            <span className="text-[11px] font-bold" style={{ color: '#64748b' }}>Mensagem de voz</span>
          </div>
          <audio controls src={m.media_url} className="w-full" preload="metadata" style={{ minHeight: 32 }} />
        </div>
      )
    }
    if (m.media_type === 'video') {
      return <video controls src={m.media_url} className="rounded-lg max-w-full max-h-[300px] mb-1" />
    }
    // document
    const filename = m.media_url.split('/').pop()?.split('?')[0] || 'arquivo'
    return (
      <a href={m.media_url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 mb-1 hover:bg-black/5 transition-colors"
        style={{ background: 'rgba(0,0,0,0.04)', textDecoration: 'none' }}>
        <span className="text-[20px]">📎</span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold truncate" style={{ color: '#1a1a2e' }}>{filename.slice(0, 40)}</p>
          <p className="text-[10px]" style={{ color: '#64748b' }}>Baixar documento</p>
        </div>
      </a>
    )
  }

  if (loading) return <div className="text-[12px] p-4" style={{ color: '#94a3b8' }}>Carregando conversa...</div>

  return (
    <div className="flex flex-col rounded-xl overflow-hidden" style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', height: 460 }}>
      {/* Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <p className="text-[40px] mb-2">💬</p>
            <p className="text-[13px]" style={{ color: '#94a3b8' }}>Nenhuma mensagem ainda</p>
            <p className="text-[11px] mt-1" style={{ color: '#cbd5e1' }}>Envie a primeira mensagem abaixo</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
            <div className={`${m.media_type === 'audio' ? 'max-w-[320px] min-w-[280px]' : 'max-w-[80%]'} px-3 py-2 rounded-2xl`}
              style={{
                background: m.direction === 'out' ? '#dcf8c6' : '#fff',
                border: m.direction === 'in' ? '1px solid #e8ecf4' : 'none',
                borderBottomRightRadius: m.direction === 'out' ? 4 : 16,
                borderBottomLeftRadius: m.direction === 'in' ? 4 : 16,
              }}>
              {renderMedia(m)}
              {m.body && (
                <p className="text-[13px] whitespace-pre-wrap break-words" style={{ color: '#1a1a2e' }}>{m.body}</p>
              )}
              <p className="text-[9px] mt-0.5 text-right" style={{ color: '#94a3b8' }}>
                {fmtTime(m.sent_at)} {m.direction === 'out' && (m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓')}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Emoji picker */}
      {showEmoji && (
        <div className="absolute bottom-[100px] right-4 z-10 p-3 rounded-xl shadow-xl"
          style={{ background: '#fff', border: '1px solid #e8ecf4', width: 320, maxHeight: 280, overflowY: 'auto' }}>
          <div className="grid grid-cols-10 gap-1">
            {QUICK_EMOJIS.map(e => (
              <button key={e} onClick={() => { insertEmoji(e); setShowEmoji(false) }}
                className="text-[20px] p-1 rounded hover:bg-gray-100 transition-colors">
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mic error banner */}
      {micError && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg flex items-start gap-2"
          style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
          <span className="text-[14px]">🎤</span>
          <p className="flex-1 text-[12px] font-semibold" style={{ color: '#991b1b' }}>{micError}</p>
          <button onClick={() => setMicError(null)} className="text-[14px] leading-none" style={{ color: '#991b1b' }}>×</button>
        </div>
      )}

      {/* Composer */}
      <div className="p-3 relative" style={{ background: '#fff', borderTop: '1px solid #e8ecf4' }}>
        {recording ? (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
            <span className="text-[13px] font-bold" style={{ color: '#dc2626' }}>
              Gravando áudio — {Math.floor(recordSecs / 60)}:{String(recordSecs % 60).padStart(2, '0')}
            </span>
            <div className="flex-1" />
            <button onClick={() => stopRecording(true)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold" style={{ color: '#64748b' }}>
              Cancelar
            </button>
            <button onClick={() => stopRecording(false)}
              className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              ➤ Enviar
            </button>
          </div>
        ) : (
          <div className="flex gap-1 items-end">
            <button onClick={() => setShowEmoji(v => !v)}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[18px] hover:bg-gray-100 transition-colors"
              title="Emoji">
              😀
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={sending}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[16px] hover:bg-gray-100 transition-colors disabled:opacity-50"
              title="Anexar arquivo">
              📎
            </button>
            <input ref={fileRef} type="file"
              accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={e => e.target.files?.[0] && sendFile(e.target.files[0])}
              className="hidden" />
            <button onClick={startRecording} disabled={sending}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[16px] hover:bg-red-50 transition-colors disabled:opacity-50"
              title="Gravar áudio">
              🎤
            </button>

            <textarea ref={textRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendText()
                }
              }}
              placeholder="Digite uma mensagem... (Enter envia)"
              rows={1}
              className="flex-1 px-3 py-2 rounded-xl text-[13px] resize-none focus:outline-none"
              style={{ background: '#f8f9fc', border: '1px solid #e8ecf4', color: '#1a1a2e', maxHeight: 100 }}
            />
            <button onClick={sendText} disabled={!text.trim() || sending}
              className="px-4 h-9 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', minWidth: 44 }}>
              {sending ? '...' : '➤'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
