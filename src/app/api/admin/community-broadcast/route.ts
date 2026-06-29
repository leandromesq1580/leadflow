import { NextRequest, NextResponse } from 'next/server'
import { getCommunityContext } from '@/lib/community-access'

// Ferramenta admin pra avisar a base sobre a Comunidade, de forma CONTROLADA.
// GET = contagem (read-only). POST = teste (1 número) ou envio em LOTE (offset/limit)
// com intervalo entre mensagens. Envio só com mode:'send' + confirm:true.
// ⚠️ Sai pelo bridge global (mesmo número das notificações de lead) — usar com parcimônia.

const BRIDGE_URL = (process.env.WA_BRIDGE_URL || 'http://62.146.229.13:3457').trim().replace(/\/$/, '')
const BRIDGE_KEY = (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()

async function computeRecipients(db: any) {
  const { data: buyers } = await db
    .from('buyers')
    .select('id, name, phone, whatsapp, crm_subscription_status')
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
    .filter((b: any) => b.crm_subscription_status === 'active' || purchased.has(b.id))
    .map((b: any) => ({ id: b.id, name: b.name, phone: String(b.phone || b.whatsapp || '').trim() }))
}

async function sendViaBridge(phone: string, message: string): Promise<boolean> {
  let num = phone.replace(/[\s\-()]/g, '').replace(/^\+/, '')
  if (!num) return false
  if (/^\d{10}$/.test(num)) num = '1' + num
  try {
    const res = await fetch(`${BRIDGE_URL}/send`, {
      method: 'POST',
      headers: { apikey: BRIDGE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: num, message }),
    })
    const d: any = await res.json().catch(() => null)
    return res.ok && !!(d && (d.success === true || d.id))
  } catch { return false }
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
    if (!message) return NextResponse.json({ error: 'Mensagem vazia.' }, { status: 400 })

    if (body?.mode === 'test') {
      const phone = String(body?.testPhone || '').trim()
      if (!phone) return NextResponse.json({ error: 'testPhone obrigatório.' }, { status: 400 })
      const ok = await sendViaBridge(phone, message)
      return NextResponse.json({ mode: 'test', ok, sent: ok ? 1 : 0 })
    }

    if (body?.mode === 'send' && body?.confirm === true) {
      const recipients = (await computeRecipients(db)).filter(r => r.phone)
      const offset = Math.max(0, Number(body?.offset) || 0)
      const limit = Math.min(Math.max(1, Number(body?.limit) || 20), 30)
      const delayMs = Math.min(Math.max(800, Number(body?.delayMs) || 1500), 5000)
      const batch = recipients.slice(offset, offset + limit)
      let sent = 0, failed = 0
      for (const r of batch) {
        const ok = await sendViaBridge(r.phone, message)
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
