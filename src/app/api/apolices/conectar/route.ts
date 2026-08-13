import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { dispararVarredura, type NLConfig } from '@/lib/nl-sync'

export const dynamic = 'force-dynamic'

/**
 * Conexão self-service do portal National Life (add-on Gestão de Apólices).
 *
 * SEGURANÇA: usuário/senha do portal NUNCA tocam o banco — passam por aqui em
 * HTTPS e vão direto pro robô no servidor, que grava num arquivo chmod 600 do
 * diretório daquele cliente. No Supabase fica só a REFERÊNCIA (url + client id).
 *
 * O acesso à feature nasce do conector (policies-access já qualifica quem tem
 * settings.nl_agent) — então conectar = liberar. Conectar exige o add-on pago
 * (settings.apolices_addon, gravado pelo webhook do Stripe) ou liberação legada.
 */

/** infra do robô: mesma instância/SECRET das entradas existentes do nl_agent */
async function infraDoRobo(db: ReturnType<typeof createAdminClient>): Promise<{ url: string; key: string } | null> {
  const { data } = await db.from('settings').select('value').eq('key', 'nl_agent').maybeSingle()
  const mapa = ((data?.value as Record<string, NLConfig>) || {})
  for (const cfg of Object.values(mapa)) {
    if (cfg?.url && cfg?.key) return { url: cfg.url.replace(/\/$/, ''), key: cfg.key }
  }
  return null
}

export async function GET() {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: addonRow } = await db.from('settings').select('value').eq('key', 'apolices_addon').maybeSingle()
  const addon = ((addonRow?.value as Record<string, { active?: boolean }>) || {})[caller.id]
  const { data: agentRow } = await db.from('settings').select('value').eq('key', 'nl_agent').maybeSingle()
  const conectado = !!((agentRow?.value as Record<string, NLConfig>) || {})[caller.id]

  return NextResponse.json({ addonAtivo: !!addon?.active, conectado })
}

export async function POST(req: Request) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({} as { usuario?: string; senha?: string; agente?: string }))
  const usuario = String(body?.usuario || '').trim()
  const senha = String(body?.senha || '')
  const agente = String(body?.agente || '').trim().toUpperCase()
  if (!usuario || !senha) return NextResponse.json({ error: 'Informe usuário e senha do portal.' }, { status: 400 })
  if (usuario.includes('\n') || senha.includes('\n')) return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 400 })

  // gate de cobrança: add-on ativo (webhook Stripe) OU liberação legada explícita
  const { data: addonRow } = await db.from('settings').select('value').eq('key', 'apolices_addon').maybeSingle()
  const addonAtivo = !!((addonRow?.value as Record<string, { active?: boolean }>) || {})[caller.id]?.active
  const { data: legadoRow } = await db.from('settings').select('value').eq('key', 'policies_access').maybeSingle()
  const legado = (((legadoRow?.value as { buyers?: string[] }) || {}).buyers || []).includes(caller.id)
  if (!addonAtivo && !legado) {
    return NextResponse.json({ error: 'Assine o add-on Gestão de Apólices para conectar seu portal.', pagar: true }, { status: 402 })
  }

  const infra = await infraDoRobo(db)
  if (!infra) return NextResponse.json({ error: 'Robô do portal não configurado na plataforma.' }, { status: 500 })

  // provisiona o cliente no robô (credenciais só saem daqui pra lá, via HTTPS)
  try {
    const r = await fetch(`${infra.url}/clients?k=${encodeURIComponent(infra.key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: caller.id, nl_user: usuario, nl_pass: senha }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d?.ok === false) {
      return NextResponse.json({ error: `Robô recusou a conexão: ${d?.error || r.status}` }, { status: 502 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Não consegui falar com o robô: ${e?.message || e}` }, { status: 502 })
  }

  // grava a REFERÊNCIA do conector (sem senha) — isso libera a feature pro buyer
  const { data: agentRow } = await db.from('settings').select('value').eq('key', 'nl_agent').maybeSingle()
  const mapa = ((agentRow?.value as Record<string, NLConfig>) || {})
  mapa[caller.id] = { url: infra.url, key: infra.key, agent: agente || undefined, client: caller.id }
  const { error } = await db.from('settings').upsert(
    { key: 'nl_agent', value: mapa, updated_at: new Date().toISOString() }, { onConflict: 'key' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // primeira varredura já sai andando (a tela acompanha, incluindo MFA)
  dispararVarredura(mapa[caller.id]).catch(() => {})

  return NextResponse.json({ ok: true, conectado: true })
}
