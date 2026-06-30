import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

// Ferramenta admin pra avisar a base sobre a Comunidade, de forma CONTROLADA.
// GET = contagem (read-only). POST = teste (1 número) ou envio em LOTE (offset/limit)
// com intervalo entre mensagens. Envio só com mode:'send' + confirm:true.
// ⚠️ Sai pelo bridge global (mesmo número das notificações de lead) — usar com parcimônia.

const BRIDGE_URL = (process.env.WA_BRIDGE_URL || 'http://62.146.229.13:3457').trim().replace(/\/$/, '')
const BRIDGE_KEY = (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()

type Recipient = { id: string; name: string; phone: string }
type Media = { mediaUrl: string; mediaMimetype?: string; mediaFilename?: string } | null

// "É ou JÁ FOI cliente": comprou (lead/appointment) OU teve assinatura de CRM (ativa OU cancelada/inadimplente).
const SUB_STATES = new Set(['active', 'canceled', 'cancelled', 'past_due', 'unpaid'])

async function computeRecipients(db: any): Promise<Recipient[]> {
  const { data: buyers } = await db
    .from('buyers')
    .select('id, name, phone, whatsapp, crm_subscription_status, crm_subscription_id, is_active')
    .order('id', { ascending: true })
    .limit(5000)
  const { data: pays } = await db.from('payments').select('buyer_id').eq('status', 'completed')
  const purchased = new Set<string>((pays || []).map((p: any) => p.buyer_id))
  const { data: creds } = await db.from('credits').select('buyer_id, stripe_payment_id').limit(20000)
  for (const c of creds || []) {
    const sid = c.stripe_payment_id ? String(c.stripe_payment_id) : ''
    if (sid && !sid.startsWith('manual:')) purchased.add(c.buyer_id)
  }
  return (buyers || [])
    .filter((b: any) => {
      if (b.is_active === false) return false // banido/suspenso (anti-fraude) NÃO recebe
      return purchased.has(b.id) || !!b.crm_subscription_id || SUB_STATES.has(String(b.crm_subscription_status || ''))
    })
    .map((b: any): Recipient => ({ id: String(b.id), name: String(b.name || ''), phone: String(b.phone || b.whatsapp || '').trim() }))
}

async function sendViaBridge(phone: string, message: string, media?: Media): Promise<boolean> {
  let num = phone.replace(/[\s\-()]/g, '').replace(/^\+/, '')
  if (!num) return false
  if (/^\d{10}$/.test(num)) num = '1' + num
  try {
    const payload: any = { number: num, message }
    if (media?.mediaUrl) {
      payload.mediaUrl = media.mediaUrl
      if (media.mediaMimetype) payload.mediaMimetype = media.mediaMimetype
      if (media.mediaFilename) payload.mediaFilename = media.mediaFilename
    }
    const res = await fetch(`${BRIDGE_URL}/send`, {
      method: 'POST',
      headers: { apikey: BRIDGE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const d: any = await res.json().catch(() => null)
    return res.ok && !!(d && (d.success === true || d.id))
  } catch { return false }
}

// Gera URL assinada (6h) pra imagem da comunidade, pra bridge baixar e enviar como anexo.
async function resolveMedia(db: any, imagePath: string | null): Promise<Media> {
  if (!imagePath || !imagePath.startsWith('community/')) return null
  const { data: signed } = await db.storage.from('lead-attachments').createSignedUrl(imagePath, 60 * 60 * 6)
  if (!signed?.signedUrl) return null
  const lower = imagePath.toLowerCase()
  const mime = lower.endsWith('.png') ? 'image/png' : (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) ? 'image/jpeg' : (lower.endsWith('.webp') ? 'image/webp' : 'image/*')
  return { mediaUrl: signed.signedUrl, mediaMimetype: mime, mediaFilename: `lead4pro.${mime.split('/')[1] || 'png'}` }
}

function mask(p: string) {
  const s = String(p || '')
  return s.length > 4 ? '••••' + s.slice(-4) : (s || '—')
}

export async function GET(_request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me } = ctx
    if (!me.isAdmin) return NextResponse.json({ error: 'Apenas admin.' }, { status: 403 })

    const recipients = await computeRecipients(db)
    const withPhone = recipients.filter(r => r.phone)
    return NextResponse.json({
      recipients: recipients.length,
      withPhone: withPhone.length,
      semTelefone: recipients.length - withPhone.length,
      amostra: withPhone.slice(0, 6).map(r => ({ nome: r.name, fone: mask(r.phone) })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getCommunityContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { db, me } = ctx
    if (!me.isAdmin) return NextResponse.json({ error: 'Apenas admin.' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const message = String(body?.message || '').trim()
    const imagePath = typeof body?.imagePath === 'string' ? body.imagePath : null
    if (!message && !imagePath) return NextResponse.json({ error: 'Mensagem ou imagem obrigatória.' }, { status: 400 })
    const media = await resolveMedia(db, imagePath)
    if (imagePath && !media) return NextResponse.json({ error: 'Não consegui gerar a URL da imagem.' }, { status: 500 })

    if (body?.mode === 'test') {
      const phone = String(body?.testPhone || '').trim()
      if (!phone) return NextResponse.json({ error: 'testPhone obrigatório.' }, { status: 400 })
      const ok = await sendViaBridge(phone, message, media)
      return NextResponse.json({ mode: 'test', ok, sent: ok ? 1 : 0, comImagem: !!media })
    }

    if (body?.mode === 'send' && body?.confirm === true) {
      const recipients = (await computeRecipients(db)).filter(r => r.phone)
      const offset = Math.max(0, Number(body?.offset) || 0)
      const limit = Math.min(Math.max(1, Number(body?.limit) || 20), 30)
      const delayMs = Math.min(Math.max(800, Number(body?.delayMs) || 1500), 5000)
      const batch = recipients.slice(offset, offset + limit)
      let sent = 0, failed = 0
      for (const r of batch) {
        const ok = await sendViaBridge(r.phone, message, media)
        if (ok) sent++; else failed++
        await new Promise(res => setTimeout(res, delayMs))
      }
      const nextOffset = offset + batch.length
      return NextResponse.json({ mode: 'send', total: recipients.length, offset, processed: batch.length, sent, failed, nextOffset, done: nextOffset >= recipients.length })
    }

    return NextResponse.json({ error: 'Use mode:"test"+testPhone, ou mode:"send"+confirm:true.' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
