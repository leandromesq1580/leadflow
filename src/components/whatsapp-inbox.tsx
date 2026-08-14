'use client'

import { useState, useEffect, useRef } from 'react'
import { useRealtime } from '@/lib/use-realtime'
import { useT } from '@/lib/i18n-client'

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
  /** 'sms' = veio/foi por SMS (aparece com etiqueta; o composer continua WhatsApp) */
  channel?: string
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
  const t = useT()
  const L = (pt: string, en: string, es: string) => t._locale === 'en' ? en : t._locale === 'es' ? es : pt
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
    // Fallback poll — 5s pra responsividade tipo chat. Realtime cobre
    // o caso normal; o poll garante que mesmo se WebSocket falhar a thread
    // atualiza em poucos segundos.
    const interval = setInterval(load, 5000)
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
    // try/finally garante que setLoading(false) sempre roda, mesmo se a fetch
    // rejeitar (network glitch, extension do browser bloqueando, etc).
    // Sem isso, qualquer falha temporaria deixa o modal travado em
    // 'Carregando conversa...' pra sempre — ate o user fechar e abrir de novo.
    try {
      const r = await fetch(`/api/whatsapp/messages?lead_id=${leadId}`)
      if (r.ok) {
        const d = await r.json()
        setMessages(d.messages || [])
      }
    } catch (err) {
      console.error('[WaInbox] Falha ao carregar mensagens:', err)
    } finally {
      setLoading(false)
    }
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
      alert(d.error || L('Erro ao enviar', 'Failed to send', 'Error al enviar'))
    }
  }

  async function sendFile(file: File) {
    setMicError(null)
    if (file.size > MAX_FILE_SIZE) {
      const mb = MAX_FILE_SIZE / 1024 / 1024
      setMicError(L(`Arquivo muito grande. Máximo ${mb}MB.`, `File is too large. Max ${mb}MB.`, `El archivo es demasiado grande. Máximo ${mb}MB.`))
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
      const isAudio = file.type.startsWith('audio/')
      setMicError(d.error || L(
        `Erro ao enviar ${isAudio ? 'audio' : 'arquivo'}. Tente de novo.`,
        `Failed to send the ${isAudio ? 'audio' : 'file'}. Please try again.`,
        `Error al enviar el ${isAudio ? 'audio' : 'archivo'}. Inténtalo de nuevo.`,
      ))
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function startRecording() {
    setMicError(null)
    // 1) Sanity checks antes de pedir permissao
    if (typeof window === 'undefined' || !window.isSecureContext) {
      setMicError(L(
        'Gravar audio precisa de HTTPS (ou localhost). Acesse pelo lead4producers.com.',
        'Audio recording requires HTTPS (or localhost). Use lead4producers.com.',
        'Grabar audio requiere HTTPS (o localhost). Entra por lead4producers.com.',
      ))
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError(L(
        'Seu navegador nao suporta gravacao de audio. Use Chrome, Edge ou Safari atualizado.',
        'Your browser does not support audio recording. Use an up-to-date Chrome, Edge, or Safari.',
        'Tu navegador no soporta grabar audio. Usa Chrome, Edge o Safari actualizado.',
      ))
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setMicError(L(
        'MediaRecorder indisponivel nesse navegador.',
        'MediaRecorder is not available in this browser.',
        'MediaRecorder no está disponible en este navegador.',
      ))
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
        setMicError(L(
          'Microfone bloqueado. Clique no cadeado da barra de endereco -> Permissoes do site -> Microfone -> Permitir. Depois F5.',
          'Microphone blocked. Click the padlock in the address bar -> Site permissions -> Microphone -> Allow. Then press F5.',
          'Micrófono bloqueado. Haz clic en el candado de la barra de direcciones -> Permisos del sitio -> Micrófono -> Permitir. Luego F5.',
        ))
      } else if (err?.name === 'NotFoundError') {
        setMicError(L(
          'Nenhum microfone encontrado nesse dispositivo.',
          'No microphone found on this device.',
          'No se encontró ningún micrófono en este dispositivo.',
        ))
      } else if (err?.name === 'NotReadableError') {
        setMicError(L(
          'Microfone em uso por outro app. Feche Zoom/Meet/etc e tente de novo.',
          'Microphone is in use by another app. Close Zoom/Meet/etc. and try again.',
          'El micrófono está en uso por otra app. Cierra Zoom/Meet/etc. e inténtalo de nuevo.',
        ))
      } else {
        setMicError(L('Falha no microfone: ', 'Microphone error: ', 'Falla del micrófono: ') + (err?.message || err?.name || L('erro desconhecido', 'unknown error', 'error desconocido')))
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
    const date = d.toLocaleDateString(t._locale === 'en' ? 'en-US' : t._locale === 'es' ? 'es-US' : 'pt-BR', { day: '2-digit', month: '2-digit' })
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    return `${date} ${time}`
  }

  function renderMedia(m: Message) {
    // Mídia sem arquivo: o WhatsApp mudou o formato de identificação das conversas (@lid)
    // e a biblioteca da ponte não consegue mais BAIXAR o anexo — o download falha, não o
    // upload. Dizer "falha de upload" fazia o corretor achar que o sistema perdeu o
    // arquivo do cliente. O arquivo continua no WhatsApp do celular dele; aqui é só a
    // cópia que não veio. Enquanto não há correção da biblioteca, a tela avisa a verdade.
    if (m.media_type && !m.media_url) {
      const rotulo = m.media_type === 'image' ? L('Imagem', 'Image', 'Imagen')
        : m.media_type === 'audio' ? L('Áudio', 'Audio', 'Audio')
        : m.media_type === 'video' ? L('Vídeo', 'Video', 'Video')
        : m.media_type === 'ptt' ? L('Áudio de voz', 'Voice note', 'Nota de voz')
        : L('Arquivo', 'File', 'Archivo')
      return (
        <div className="flex items-start gap-2 rounded-lg px-2.5 py-2 mb-1"
          style={{ background: 'var(--warn-soft)', border: '1px dashed #fde68a' }}>
          <span className="text-[15px]">📎</span>
          <div>
            <p className="text-[11.5px] font-bold" style={{ color: '#92400e' }}>
              {rotulo} {L('recebida — abra no seu WhatsApp', 'received — open it in your WhatsApp', 'recibido — ábrelo en tu WhatsApp')}
            </p>
            <p className="text-[10.5px]" style={{ color: '#b45309' }}>
              {L('O arquivo está na conversa do seu celular. A cópia não chegou aqui.', 'The file is in the chat on your phone. The copy did not arrive here.', 'El archivo está en la conversación de tu celular. La copia no llegó aquí.')}
            </p>
          </div>
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
            <span className="text-[11px] font-bold" style={{ color: 'var(--fg-secondary)' }}>{L('Mensagem de voz', 'Voice message', 'Mensaje de voz')}</span>
          </div>
          <audio controls src={m.media_url} className="w-full" preload="metadata" style={{ minHeight: 32 }} />
        </div>
      )
    }
    if (m.media_type === 'video') {
      return <video controls src={m.media_url} className="rounded-lg max-w-full max-h-[300px] mb-1" />
    }
    // document
    const filename = m.media_url.split('/').pop()?.split('?')[0] || L('arquivo', 'file', 'archivo')
    return (
      <a href={m.media_url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 mb-1 hover:bg-black/5 transition-colors"
        style={{ background: 'rgba(0,0,0,0.04)', textDecoration: 'none' }}>
        <span className="text-[20px]">📎</span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold truncate" style={{ color: 'var(--fg)' }}>{filename.slice(0, 40)}</p>
          <p className="text-[10px]" style={{ color: 'var(--fg-secondary)' }}>{L('Baixar documento', 'Download document', 'Descargar documento')}</p>
        </div>
      </a>
    )
  }

  if (loading) return <div className="text-[12px] p-4" style={{ color: 'var(--fg-muted)' }}>{L('Carregando conversa...', 'Loading conversation...', 'Cargando conversación...')}</div>

  return (
    <div className="flex flex-col rounded-xl overflow-hidden" style={{ background: 'var(--bg)', border: '1px solid #e8ecf4', height: 460 }}>
      {/* Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <p className="text-[40px] mb-2">💬</p>
            <p className="text-[13px]" style={{ color: 'var(--fg-muted)' }}>{L('Nenhuma mensagem ainda', 'No messages yet', 'Aún no hay mensajes')}</p>
            <p className="text-[11px] mt-1" style={{ color: '#cbd5e1' }}>{L('Envie a primeira mensagem abaixo', 'Send the first message below', 'Envía el primer mensaje abajo')}</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
            <div className={`${m.media_type === 'audio' ? 'max-w-[320px] min-w-[280px]' : 'max-w-[80%]'} px-3 py-2 rounded-2xl`}
              style={{
                background: m.direction === 'out' ? '#dcf8c6' : 'var(--bg-card)',
                border: m.direction === 'in' ? '1px solid #e8ecf4' : 'none',
                borderBottomRightRadius: m.direction === 'out' ? 4 : 16,
                borderBottomLeftRadius: m.direction === 'in' ? 4 : 16,
              }}>
              {m.channel === 'sms' && (
                <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded mb-1"
                  style={{ background: m.direction === 'out' ? 'rgba(15,118,110,0.12)' : 'var(--accent-light)', color: m.direction === 'out' ? '#0f766e' : '#6366f1', letterSpacing: 0.5 }}>
                  SMS
                </span>
              )}
              {renderMedia(m)}
              {m.body && (
                <p className="text-[13px] whitespace-pre-wrap break-words" style={{ color: 'var(--fg)' }}>{m.body}</p>
              )}
              <p className="text-[9px] mt-0.5 text-right" style={{ color: 'var(--fg-muted)' }}>
                {fmtTime(m.sent_at)} {m.direction === 'out' && m.channel !== 'sms' && (m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓')}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Emoji picker */}
      {showEmoji && (
        <div className="absolute bottom-[100px] right-4 z-10 p-3 rounded-xl shadow-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid #e8ecf4', width: 320, maxHeight: 280, overflowY: 'auto' }}>
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
          style={{ background: 'var(--err-soft)', border: '1px solid #fecaca' }}>
          <span className="text-[14px]">🎤</span>
          <p className="flex-1 text-[12px] font-semibold" style={{ color: '#991b1b' }}>{micError}</p>
          <button onClick={() => setMicError(null)} className="text-[14px] leading-none" style={{ color: '#991b1b' }}>×</button>
        </div>
      )}

      {/* Composer */}
      <div className="p-3 relative" style={{ background: 'var(--bg-card)', borderTop: '1px solid #e8ecf4' }}>
        {recording ? (
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'var(--err-soft)', border: '1px solid #fecaca' }}>
            <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
            <span className="text-[13px] font-bold" style={{ color: '#dc2626' }}>
              {L('Gravando áudio', 'Recording audio', 'Grabando audio')} — {Math.floor(recordSecs / 60)}:{String(recordSecs % 60).padStart(2, '0')}
            </span>
            <div className="flex-1" />
            <button onClick={() => stopRecording(true)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold" style={{ color: 'var(--fg-secondary)' }}>
              {L('Cancelar', 'Cancel', 'Cancelar')}
            </button>
            <button onClick={() => stopRecording(false)}
              className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              ➤ {L('Enviar', 'Send', 'Enviar')}
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
              title={L('Anexar arquivo', 'Attach file', 'Adjuntar archivo')}>
              📎
            </button>
            <input ref={fileRef} type="file"
              accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={e => e.target.files?.[0] && sendFile(e.target.files[0])}
              className="hidden" />
            <button onClick={startRecording} disabled={sending}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[16px] hover:bg-red-50 transition-colors disabled:opacity-50"
              title={L('Gravar áudio', 'Record audio', 'Grabar audio')}>
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
              placeholder={L('Digite uma mensagem... (Enter envia)', 'Type a message... (Enter to send)', 'Escribe un mensaje... (Enter envía)')}
              rows={1}
              className="flex-1 px-3 py-2 rounded-xl text-[13px] resize-none focus:outline-none"
              style={{ background: 'var(--bg)', border: '1px solid #e8ecf4', color: 'var(--fg)', maxHeight: 100 }}
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
