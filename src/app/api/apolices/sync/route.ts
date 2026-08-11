import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { sincronizarNL, conectorDe, dispararVarredura, statusVarredura, enviarCodigoMfa } from '@/lib/nl-sync'
import { acessoApolices } from '@/lib/policies-access'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/apolices/sync — atualização em 3 fases, porque o robô que varre o
 * portal de verdade (Playwright) leva uns minutos:
 *   {modo:'varrer'}   → acorda o robô (se já não estiver varrendo)
 *   {modo:'status'}   → o robô terminou? pediu MFA? deu erro?
 *   {modo:'importar'} → traz o feed pra tabela policies (comportamento clássico)
 * Sem body = 'importar'. Fatos da seguradora sobrescrevem; decisão do corretor, nunca.
 */
export async function POST(req: Request) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const acesso = await acessoApolices(db, caller.id)
  if (!acesso.pode) return NextResponse.json({ error: 'Recurso não habilitado nesta conta.' }, { status: 403 })

  const body = await req.json().catch(() => ({} as { modo?: string; code?: string }))
  const modo = body?.modo || 'importar'

  if (modo === 'varrer' || modo === 'status' || modo === 'mfa') {
    const cfg = await conectorDe(db, acesso.bookDe)
    if (!cfg) return NextResponse.json({ error: 'Conector não configurado nesta conta.' }, { status: 400 })

    if (modo === 'mfa') {
      const code = String(body?.code || '').replace(/\D/g, '')
      if (code.length < 4) return NextResponse.json({ error: 'Código inválido.' }, { status: 400 })
      const r = await enviarCodigoMfa(cfg, code)
      if (!r.ok) return NextResponse.json({ error: r.erro || 'O robô recusou o código.' }, { status: 502 })
      return NextResponse.json({ ok: true })
    }

    if (modo === 'varrer') {
      const st = await statusVarredura(cfg)
      if (st?.running) return NextResponse.json({ varrendo: true, jaEstava: true })
      const r = await dispararVarredura(cfg)
      if (!r.ok) return NextResponse.json({ error: `Não consegui acordar o robô do portal: ${r.erro}` }, { status: 502 })
      return NextResponse.json({ varrendo: true })
    }

    const st = await statusVarredura(cfg)
    if (!st) return NextResponse.json({ error: 'O robô do portal não respondeu.' }, { status: 502 })
    return NextResponse.json(st)
  }

  const r = await sincronizarNL(db, acesso.bookDe)
  if (!r.ok) return NextResponse.json({ error: r.erro || 'Falha na sincronização' }, { status: 400 })
  return NextResponse.json(r)
}

/** GET — conector + frescor: quando o ROBÔ varreu o portal por último (não confundir
 *  com a última importação). A tela usa isso pra avisar dado velho e auto-importar. */
export async function GET() {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const acesso = await acessoApolices(db, caller.id)
  if (!acesso.pode) return NextResponse.json({ error: 'Recurso não habilitado nesta conta.' }, { status: 403 })
  const cfg = await conectorDe(db, acesso.bookDe)
  const robo = cfg ? await statusVarredura(cfg) : null
  return NextResponse.json({
    conectado: !!cfg,
    seguradora: cfg ? 'National Life' : null,
    agente: cfg?.agent || null,
    ultimaSync: cfg?.last_sync || null,
    robo,
  })
}
