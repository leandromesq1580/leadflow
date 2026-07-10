'use client'

import { useEffect, useRef, useState } from 'react'

/** Dispara uma ligação de qualquer lugar do app: callLead('+1...', 'Nome', leadId). */
export function callLead(phone: string, name?: string, leadId?: string) {
  window.dispatchEvent(new CustomEvent('l4p:call', { detail: { phone, name, leadId } }))
}

type Status = 'off' | 'ready' | 'connecting' | 'ringing' | 'incall' | 'error'

function fmt(s: number) {
  const m = Math.floor(s / 60), r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

/** Softphone global — inicializa o Device 1x e atende os eventos de ligação. */
export function Softphone() {
  const [status, setStatus] = useState<Status>('off')
  const [info, setInfo] = useState<{ name?: string; phone?: string }>({})
  const [seconds, setSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const deviceRef = useRef<any>(null)
  const callRef = useRef<any>(null)
  const buyerIdRef = useRef<string>('')
  const timerRef = useRef<any>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/voice/token', { cache: 'no-store' })
        if (!res.ok) return
        const { token, identity } = await res.json()
        buyerIdRef.current = identity || ''
        const { Device } = await import('@twilio/voice-sdk')
        if (!mounted) return
        const device = new Device(token, { codecPreferences: ['opus', 'pcmu'] as any, logLevel: 'error' as any })
        device.on('registered', () => { if (mounted) setStatus('ready') })
        device.on('error', (e: any) => { console.warn('[softphone]', e?.message || e); if (mounted) setStatus(s => (s === 'off' ? 'error' : s)) })
        device.on('tokenWillExpire', async () => {
          try { const r = await fetch('/api/voice/token', { cache: 'no-store' }); const j = await r.json(); device.updateToken(j.token) } catch {}
        })
        await device.register()
        deviceRef.current = device
      } catch (e: any) {
        console.warn('[softphone] init:', e?.message || e)
      }
    })()

    const onCall = (ev: Event) => startCall((ev as CustomEvent).detail)
    window.addEventListener('l4p:call', onCall as EventListener)
    return () => {
      mounted = false
      window.removeEventListener('l4p:call', onCall as EventListener)
      clearInterval(timerRef.current)
      try { deviceRef.current?.destroy() } catch {}
    }
  }, [])

  function startTimer() { setSeconds(0); clearInterval(timerRef.current); timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000) }

  async function startCall(detail: { phone: string; name?: string; leadId?: string }) {
    const device = deviceRef.current
    if (!device) { alert('Telefone ainda conectando — tente de novo em 2s.'); return }
    if (status === 'connecting' || status === 'ringing' || status === 'incall') return
    setInfo({ name: detail.name, phone: detail.phone }); setMuted(false); setStatus('connecting')
    try {
      const call = await device.connect({ params: { To: detail.phone, leadId: detail.leadId || '', buyerId: buyerIdRef.current } })
      callRef.current = call
      call.on('ringing', () => setStatus('ringing'))
      call.on('accept', () => { setStatus('incall'); startTimer() })
      call.on('disconnect', endUi)
      call.on('cancel', endUi)
      call.on('reject', endUi)
      call.on('error', (e: any) => { console.warn('[softphone] call:', e?.message || e); endUi() })
    } catch (e: any) { console.warn('[softphone] connect:', e?.message || e); endUi() }
  }

  function endUi() { clearInterval(timerRef.current); callRef.current = null; setStatus(deviceRef.current ? 'ready' : 'off') }
  function hangup() { try { callRef.current?.disconnect() } catch {} endUi() }
  function toggleMute() { const c = callRef.current; if (!c) return; const m = !muted; try { c.mute(m) } catch {}; setMuted(m) }

  const active = status === 'connecting' || status === 'ringing' || status === 'incall'
  if (!active) return null

  const label = status === 'connecting' ? 'Conectando…' : status === 'ringing' ? 'Chamando…' : fmt(seconds)

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999, width: 300,
      background: '#0f172a', color: '#fff', borderRadius: 16, padding: 16,
      boxShadow: '0 20px 60px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e,#16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📞</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.name || info.phone}</p>
          <p style={{ margin: 0, fontSize: 12, color: status === 'incall' ? '#34d399' : '#94a3b8' }}>{label}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={toggleMute} disabled={status !== 'incall'} style={{
          flex: 1, height: 40, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
          background: muted ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: status === 'incall' ? 'pointer' : 'default', opacity: status === 'incall' ? 1 : 0.5,
        }}>{muted ? '🔇 Mudo' : '🎙 Mutar'}</button>
        <button onClick={hangup} style={{
          flex: 1, height: 40, borderRadius: 10, border: 'none',
          background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>Desligar</button>
      </div>
    </div>
  )
}
