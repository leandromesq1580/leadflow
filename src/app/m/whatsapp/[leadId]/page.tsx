'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n-client'
import { MIcon } from '@/components/mobile/icons'
import { getInitials } from '@/lib/utils'

interface Msg { id: string; direction: 'in' | 'out'; body: string | null; sent_at: string; status?: string; media_url?: string | null; media_type?: string | null; wa_message_id?: string | null; channel?: string }

function avatarBg(name: string) {
  const h = ((name?.charCodeAt(0) || 65) * 37) % 360
  return `linear-gradient(135deg, hsl(${h}, 62%, 52%), hsl(${(h + 40) % 360}, 62%, 46%))`
}
function hhmm(iso: string) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

export default function MobileThread() {
  const t = useT()
  const loc = t._locale
  const L = (pt: string, en: string, es: string) => (loc === 'en' ? en : loc === 'es' ? es : pt)
  const params = useParams()
  const router = useRouter()
  const leadId = params?.leadId as string

  const [buyerId, setBuyerId] = useState<string | null>(null)
  const [lead, setLead] = useState<{ name: string; phone: string } | null>(null)
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sendErr, setSendErr] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!leadId) return
    fetch('/api/m/team-context', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d?.buyer_id) setBuyerId(d.buyer_id) }).catch(() => {})
    fetch(`/api/leads/${leadId}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d?.lead) setLead({ name: d.lead.name, phone: d.lead.phone }) }).catch(() => {})
    const load = () => fetch(`/api/whatsapp/messages?lead_id=${leadId}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setMsgs(d.messages || []) }).catch(() => {})
    load()
    fetch('/api/whatsapp/messages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: leadId }) }).catch(() => {})
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [leadId])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'auto' }) }, [msgs?.length])

  async function send() {
    const body = text.trim()
    if (!body || sending || !buyerId) return
    setSending(true); setSendErr('')
    try {
      const r = await fetch('/api/whatsapp/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lead_id: leadId, buyer_id: buyerId, body }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setSendErr(d.error || L('Não consegui enviar.', "Couldn't send.", 'No pude enviar.')); setSending(false); return }
      setText('')
      if (d.message) setMsgs(prev => [...(prev || []), d.message])
    } catch { setSendErr(L('Não consegui enviar.', "Couldn't send.", 'No pude enviar.')) }
    setSending(false)
  }

  async function deleteMessage(message: Msg) {
    if (deletingId) return
    if (!window.confirm(L(
      'Apagar esta mensagem para todos? Essa ação não pode ser desfeita.',
      'Delete this message for everyone? This cannot be undone.',
      '¿Eliminar este mensaje para todos? Esta acción no se puede deshacer.',
    ))) return

    setDeletingId(message.id)
    setSendErr('')
    try {
      const response = await fetch('/api/whatsapp/messages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: message.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setSendErr(result.error || L('Não consegui apagar.', "Couldn't delete it.", 'No pude eliminarlo.'))
        return
      }
      setMsgs(current => (current || []).filter(item => item.id !== message.id))
    } catch {
      setSendErr(L('Não consegui apagar agora.', "Couldn't delete it right now.", 'No pude eliminarlo ahora.'))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      {/* header da conversa */}
      <div className="m-chat-head">
        <button onClick={() => router.back()} className="m-tap" style={{ background: 'none', border: 'none', color: 'var(--m-text)', display: 'flex', cursor: 'pointer', padding: 0 }} aria-label={L('Voltar', 'Back', 'Volver')}><MIcon name="arrowLeft" size={24} /></button>
        <div className="m-av" style={{ width: 38, height: 38, fontSize: 13, background: avatarBg(lead?.name || '?') }}>{getInitials(lead?.name || '?')}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead?.name || '…'}</p>
          <p className="m-faint" style={{ margin: 0, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead?.phone || ''}</p>
        </div>
        {lead?.phone && <a href={`tel:${lead.phone.replace(/\D/g, '')}`} className="m-tap" style={{ color: '#a5b4fc', display: 'flex' }} aria-label={L('Ligar', 'Call', 'Llamar')}><MIcon name="phone" size={20} /></a>}
      </div>

      {/* mensagens */}
      <div className="m-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14, paddingBottom: 96, minHeight: '40vh' }}>
        {!msgs && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><div className="m-spin" /></div>}
        {msgs && msgs.length === 0 && <p className="m-muted" style={{ textAlign: 'center', paddingTop: 40, fontSize: 13 }}>{L('Nenhuma mensagem ainda. Mande a primeira.', 'No messages yet. Send the first.', 'Sin mensajes. Envía el primero.')}</p>}
        {(msgs || []).map(m => (
          <div key={m.id} className={`m-bubble ${m.direction === 'out' ? 'm-bubble-out' : 'm-bubble-in'}`}>
            {m.media_url && (
              m.media_type === 'image'
                ? <img src={m.media_url} alt="" style={{ maxWidth: '100%', borderRadius: 10, marginBottom: m.body ? 6 : 0, display: 'block' }} />
                : <a href={m.media_url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', fontSize: 12 }}>{L('Anexo', 'Attachment', 'Adjunto')}</a>
            )}
            {m.body && <span>{m.body}</span>}
            <span className="m-bubble-time">{hhmm(m.sent_at)}</span>
            {m.direction === 'out' && m.channel !== 'sms' && m.wa_message_id && (
              <button
                type="button"
                onClick={() => deleteMessage(m)}
                disabled={deletingId !== null}
                style={{ display: 'block', margin: '5px 0 0 auto', padding: 0, border: 0, background: 'transparent', color: '#fca5a5', fontSize: 10, fontWeight: 700 }}
              >
                {deletingId === m.id ? L('Apagando...', 'Deleting...', 'Eliminando...') : `🗑 ${L('Apagar', 'Delete', 'Eliminar')}`}
              </button>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* composer */}
      <div className="m-composer">
        <div style={{ flex: 1 }}>
          {sendErr && <p style={{ margin: '0 0 6px', fontSize: 11, color: '#fca5a5' }}>{sendErr}</p>}
          <input className="m-input" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder={L('Mensagem...', 'Message...', 'Mensaje...')} style={{ height: 44 }} />
        </div>
        <button onClick={send} disabled={sending || !text.trim()} className="m-send-btn m-tap" style={{ opacity: sending || !text.trim() ? 0.5 : 1 }} aria-label={L('Enviar', 'Send', 'Enviar')}>
          <MIcon name="send" size={19} />
        </button>
      </div>
    </div>
  )
}
