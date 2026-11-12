import { createAdminClient } from '@/lib/supabase/admin'
import { getWhatsAppCloudConfig } from '@/lib/wa-cloud'
import { parseWhatsAppCloudEvents, verifyWhatsAppCloudSignature, whatsappCloudChallenge } from '@/lib/wa-cloud-webhook'

export const runtime = 'nodejs'
const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024

export function GET(request: Request) {
  const config = getWhatsAppCloudConfig()
  if (!config) return new Response(null, { status: 503 })
  const challenge = whatsappCloudChallenge(new URL(request.url).searchParams, config.verifyToken)
  return challenge === null
    ? new Response(null, { status: 403 })
    : new Response(challenge, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const config = getWhatsAppCloudConfig()
  if (!config) return new Response(null, { status: 503 })

  if (Number(request.headers.get('content-length')) > MAX_PAYLOAD_BYTES) return new Response(null, { status: 413 })
  let raw: Uint8Array
  try {
    raw = new Uint8Array(await request.arrayBuffer())
  } catch {
    return new Response(null, { status: 400 })
  }
  if (raw.length > MAX_PAYLOAD_BYTES) return new Response(null, { status: 413 })
  if (!verifyWhatsAppCloudSignature(raw, request.headers.get('x-hub-signature-256'), config.appSecret)) {
    return new Response(null, { status: 403 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))
  } catch {
    return new Response(null, { status: 400 })
  }
  const events = parseWhatsAppCloudEvents(payload, config)
  if (!events.length) return new Response(null, { status: 200 })

  try {
    const db = createAdminClient()
    const deadline = AbortSignal.timeout(10_000)
    for (const event of events) {
      const rpc = event.type === 'inbound'
        ? db.rpc('apply_wa_cloud_inbound', {
          p_phone: event.phone,
          p_event_at: event.eventAt,
          p_message_id: event.messageId,
          p_subscribed: event.subscribed,
          p_body: event.body,
          p_reply_to: event.replyTo,
        })
        : db.rpc('apply_wa_cloud_status', {
          p_operation_id: event.operationId,
          p_message_id: event.messageId,
          p_status: event.status,
          p_phone: event.phone,
        })
      const { error } = await rpc.abortSignal(deadline)
      if (error) return new Response(null, { status: 500 })
    }
  } catch {
    return new Response(null, { status: 500 })
  }
  return new Response(null, { status: 200 })
}
