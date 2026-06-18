import { NextResponse } from 'next/server'

// DEBUG TEMPORÁRIO: replica sendWhatsApp e mostra exatamente o que o Vercel
// recebe do bridge (pra achar por que a detecção de sucesso falha). Remover depois.
export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('secret') !== (process.env.POLL_SECRET || 'lead4producers-poll-2026')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const clean = (s: string) => String(s).trim().replace(/\\n/g, '').replace(/\s+$/, '').replace(/\/$/, '')
  const rawUrl = process.env.WA_BRIDGE_URL || '(default)'
  const rawKey = process.env.WA_BRIDGE_KEY || '(default)'
  const bridgeUrl = clean(process.env.WA_BRIDGE_URL || 'http://31.220.97.186:3457')
  const bridgeKey = (process.env.WA_BRIDGE_KEY || 'leadflow-bridge-2026').trim()
  const number = url.searchParams.get('number') || '18632808023'

  const debug: any = {
    rawUrl_json: JSON.stringify(rawUrl),
    rawKey_len: rawKey.length,
    rawKey_json: JSON.stringify(rawKey),
    cleanUrl: bridgeUrl,
    cleanKey_len: bridgeKey.length,
  }
  try {
    const res = await fetch(`${bridgeUrl}/send`, {
      method: 'POST',
      headers: { apikey: bridgeKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, message: '🧪 wa-debug (ignorar)' }),
    })
    const text = await res.text()
    let parsed: any = null
    try { parsed = JSON.parse(text) } catch {}
    debug.status = res.status
    debug.ok_http = res.ok
    debug.raw_body = text.slice(0, 300)
    debug.parsed = parsed
    debug.computed_ok = res.ok && !!(parsed && (parsed.success === true || parsed.id))
  } catch (e: any) {
    debug.fetch_error = e?.message
    debug.fetch_cause = String(e?.cause || '')
  }
  return NextResponse.json(debug)
}
