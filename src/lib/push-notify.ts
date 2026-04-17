import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Send a web push notification to all subscriptions of a buyer.
 * Uses VAPID (Web Push Protocol) via direct fetch — no web-push library needed.
 * Requires VAPID_PRIVATE_KEY and VAPID_SUBJECT (mailto:...) env vars.
 */
export async function pushToBuyer(buyerId: string, payload: { title: string; body: string; url?: string; tag?: string }): Promise<number> {
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim()
  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim()
  const subject = (process.env.VAPID_SUBJECT || 'mailto:noreply@lead4producers.com').trim()

  if (!privateKey || !publicKey) {
    console.warn('[Push] VAPID keys not configured')
    return 0
  }

  const db = createAdminClient()
  const { data: subs } = await db.from('push_subscriptions').select('*').eq('buyer_id', buyerId)
  if (!subs || subs.length === 0) return 0

  let delivered = 0
  for (const sub of subs) {
    try {
      const webpush = await import('web-push')
      webpush.default.setVapidDetails(subject, publicKey, privateKey)
      await webpush.default.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
      delivered++
      await db.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', sub.id)
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        // Subscription expired — remove
        await db.from('push_subscriptions').delete().eq('id', sub.id)
      } else {
        console.error('[Push] Failed to send:', err?.message)
      }
    }
  }

  return delivered
}
