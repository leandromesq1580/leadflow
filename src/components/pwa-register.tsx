'use client'

import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

interface Props {
  buyerId: string
}

export function PwaRegister({ buyerId }: Props) {
  const [showPrompt, setShowPrompt] = useState(false)
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('[SW] reg failed', e))

    // Check if already subscribed
    navigator.serviceWorker.ready.then(async reg => {
      const sub = await reg.pushManager.getSubscription()
      setSubscribed(!!sub)
      // Show prompt if we have VAPID key + not subscribed + permission not denied
      const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (vapid && !sub && Notification.permission === 'default') {
        setTimeout(() => setShowPrompt(true), 8000)
      }
    })
  }, [buyerId])

  async function enable() {
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapid) { alert('Push não configurado'); return }
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setShowPrompt(false); return }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      })

      const subJson = sub.toJSON()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_id: buyerId,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth,
          user_agent: navigator.userAgent,
        }),
      })
      setSubscribed(true)
      setShowPrompt(false)
    } catch (e: any) {
      console.error('[Push] subscribe failed', e)
      setShowPrompt(false)
    }
  }

  if (!showPrompt || subscribed) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl p-4 shadow-xl"
      style={{ background: '#fff', border: '1px solid #e8ecf4' }}>
      <div className="flex items-start gap-3">
        <span className="text-[24px]">🔔</span>
        <div className="flex-1">
          <p className="text-[14px] font-bold" style={{ color: '#1a1a2e' }}>Receba notificações de leads novos</p>
          <p className="text-[12px] mt-1" style={{ color: '#64748b' }}>Seja o primeiro a responder. Ative notificações no navegador.</p>
          <div className="flex gap-2 mt-3">
            <button onClick={enable}
              className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              Ativar
            </button>
            <button onClick={() => setShowPrompt(false)}
              className="px-4 py-1.5 rounded-lg text-[12px] font-bold"
              style={{ color: '#64748b' }}>
              Depois
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
