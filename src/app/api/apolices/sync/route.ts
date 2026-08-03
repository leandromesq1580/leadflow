import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { sincronizarNL, conectorDe } from '@/lib/nl-sync'
import { podeVerApolices } from '@/lib/policies-access'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/apolices/sync — puxa o portal da seguradora e atualiza o book do corretor.
 * Só mexe no que é fato da seguradora (status, pendências, datas, dívida). O que o
 * corretor escreveu (ação, anotações, contato) fica intacto.
 */
export async function POST() {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!(await podeVerApolices(db, caller.id))) return NextResponse.json({ error: 'Recurso não habilitado nesta conta.' }, { status: 403 })

  const r = await sincronizarNL(db, caller.id)
  if (!r.ok) return NextResponse.json({ error: r.erro || 'Falha na sincronização' }, { status: 400 })
  return NextResponse.json(r)
}

/** GET — a conta tem conector configurado? (a tela usa pra mostrar ou não o botão) */
export async function GET() {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await podeVerApolices(db, caller.id))) return NextResponse.json({ error: 'Recurso não habilitado nesta conta.' }, { status: 403 })
  const cfg = await conectorDe(db, caller.id)
  return NextResponse.json({
    conectado: !!cfg,
    seguradora: cfg ? 'National Life' : null,
    agente: cfg?.agent || null,
    ultimaSync: cfg?.last_sync || null,
  })
}
