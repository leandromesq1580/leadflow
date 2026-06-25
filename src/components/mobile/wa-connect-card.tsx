'use client'

import { useEffect, useRef, useState } from 'react'
import { MIcon } from './icons'

interface QrState { status: string; ready: boolean; number: string | null; qr: string | null }

export function WaConnectCard({ locale }: { locale?: string }) {
  const [state, setState] = useState<QrState | null>(null)
  const [connecting, setConnecting] = useState(false)
  const timerRef = useRef<any>(null)
  const L = (pt: string, en: string, es: string) => (locale === 'en' ? en : locale === 'es' ? es : pt)

  const poll = () => fetch('/api/whatsapp/qr', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setState(d) }).catch(() => {})

  useEffect(() => {
    poll()
    timerRef.current = setInterval(poll, 4000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  async function connect() {
    setConnecting(true)
    try {
      const r = await fetch('/api/whatsapp/connect', { method: 'POST' })
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || L('Não consegui conectar agora.', "Couldn't connect.", 'No pude conectar.')) }
    } catch {}
    setConnecting(false)
    poll()
  }

  async function disconnect() {
    if (!confirm(L('Desconectar o WhatsApp deste número?', 'Disconnect this WhatsApp?', '¿Desconectar este WhatsApp?'))) return
    try { await fetch('/api/whatsapp/qr', { method: 'POST' }) } catch {}
    poll()
  }

  const status = state?.status
  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
      <div className="m-icb" style={{ background: 'rgba(52,211,153,0.18)', color: '#34d399' }}><MIcon name="whatsapp" size={18} /></div>
      <div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>WhatsApp</p>
        <p className="m-faint" style={{ margin: '1px 0 0', fontSize: 12 }}>{L('Conecte pra responder pelo app', 'Connect to reply in the app', 'Conecta para responder')}</p>
      </div>
    </div>
  )

  return (
    <div className="m-card" style={{ padding: 18, marginBottom: 16 }}>
      {head}

      {!state && <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}><div className="m-spin" /></div>}

      {status === 'connected' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', borderRadius: 12, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', marginBottom: 12 }}>
            <span style={{ color: '#34d399', display: 'flex' }}><MIcon name="check" size={18} /></span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#34d399' }}>{L('Conectado', 'Connected', 'Conectado')}</p>
              {state?.number && <p className="m-muted" style={{ margin: '1px 0 0', fontSize: 12 }}>{state.number}</p>}
            </div>
          </div>
          <button onClick={disconnect} className="m-tap" style={{ width: '100%', height: 44, borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{L('Desconectar', 'Disconnect', 'Desconectar')}</button>
        </div>
      )}

      {status === 'pending_qr' && state?.qr && (
        <div style={{ textAlign: 'center' }}>
          <p className="m-muted" style={{ fontSize: 13, margin: '0 0 12px' }}>{L('Abra o WhatsApp › Aparelhos conectados › Conectar aparelho e escaneie:', 'Open WhatsApp › Linked devices › Link a device and scan:', 'Abre WhatsApp › Dispositivos vinculados y escanea:')}</p>
          <img src={state.qr} alt="QR" width={224} height={224} style={{ borderRadius: 12, background: '#fff', padding: 8, imageRendering: 'pixelated' }} />
        </div>
      )}

      {status === 'starting' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', padding: '8px 0' }}>
          <div className="m-spin" style={{ width: 22, height: 22 }} /><span className="m-muted" style={{ fontSize: 13 }}>{L('Iniciando conexão…', 'Starting…', 'Iniciando…')}</span>
        </div>
      )}

      {(status === 'not_configured' || status === 'disconnected') && (
        <button onClick={connect} disabled={connecting} className="m-tap" style={{ width: '100%', height: 48, borderRadius: 13, background: 'var(--m-grad)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: connecting ? 0.6 : 1 }}>
          {connecting ? L('Conectando…', 'Connecting…', 'Conectando…') : L('Conectar meu WhatsApp', 'Connect my WhatsApp', 'Conectar mi WhatsApp')}
        </button>
      )}

      {status === 'unreachable' && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#fbbf24', margin: '0 0 12px' }}>{L('Conexão instável. Tente reconectar.', 'Unstable connection. Try reconnecting.', 'Conexión inestable.')}</p>
          <button onClick={disconnect} className="m-tap" style={{ width: '100%', height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--m-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{L('Resetar conexão', 'Reset connection', 'Resetear')}</button>
        </div>
      )}
    </div>
  )
}
