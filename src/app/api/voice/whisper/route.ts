import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * /api/voice/whisper — TwiML executado SÓ pro LEAD (atributo url do <Number>) antes
 * do bridge com o agente. Aviso de consentimento de gravação BILÍNGUE (decisão
 * 2026-07-24): estados two-party (FL, MA, CA, PA, CT, WA…) exigem que a outra parte
 * saiba da gravação — quem continua na linha após o aviso consente. O agente não
 * ouve isso; ouve o ringTone até o bridge completar.
 */
function twiml(): Response {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Say voice="alice" language="en-US">This call may be recorded and monitored.</Say>` +
    `<Say voice="alice" language="pt-BR">Esta ligação pode ser gravada e monitorada.</Say>` +
    `</Response>`
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } })
}

export async function POST(_request: NextRequest) { return twiml() }
export async function GET(_request: NextRequest) { return twiml() }
