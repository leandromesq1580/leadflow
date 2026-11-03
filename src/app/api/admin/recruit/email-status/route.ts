import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { campaignConfiguration } from '@/lib/email-campaigns'
import { campaignProvider } from '@/lib/email-campaign-provider'

// Diagnóstico SOMENTE LEITURA do envio de recrutamento: o domínio do remetente está verificado no Resend?
// E o que aconteceu com os últimos e-mails de teste ("[TESTE]")? Nunca devolve chave, segredo nem corpo do e-mail.
export const dynamic = 'force-dynamic'
export const maxDuration = 30
const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  const caller = await callerBuyer(createAdminClient())
  if (!caller) return NextResponse.json({ error: 'Entre novamente na sua conta.' }, { status: 401, headers: NO_STORE })
  if (!caller.isAdmin) return NextResponse.json({ error: 'Apenas administradores.' }, { status: 403, headers: NO_STORE })
  const cfg = campaignConfiguration(process.env)
  if (!cfg.key) return NextResponse.json({ error: 'Falta a chave do provedor.' }, { status: 409, headers: NO_STORE })
  const out: Record<string, unknown> = { from: cfg.from, domain: cfg.domain, ready: cfg.ready, issues: cfg.issues }
  try { out.domainVerified = await campaignProvider(cfg).verifyDomain(cfg.domain) } catch { out.domainVerified = null }
  try {
    const r = await fetch('https://api.resend.com/emails?limit=40', { headers: { Authorization: `Bearer ${cfg.key}` }, cache: 'no-store', signal: AbortSignal.timeout(12000) })
    out.listStatus = r.status
    if (r.ok) {
      const j = await r.json()
      const rows = Array.isArray(j.data) ? j.data : []
      out.recentTests = rows
        .filter((m: { subject?: string }) => typeof m.subject === 'string' && m.subject.startsWith('[TESTE]'))
        .slice(0, 8)
        .map((m: { created_at?: string; to?: string[]; subject?: string; last_event?: string }) => ({ created_at: m.created_at, to: m.to, subject: m.subject, last_event: m.last_event }))
      out.recentAll = rows.slice(0, 8).map((m: { created_at?: string; last_event?: string }) => ({ created_at: m.created_at, last_event: m.last_event }))
    }
  } catch { out.listStatus = 'erro_de_rede' }
  return NextResponse.json(out, { headers: NO_STORE })
}
