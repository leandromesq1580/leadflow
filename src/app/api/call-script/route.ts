import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callerBuyer } from '@/lib/api-auth'
import { SCRIPT_IUL_PADRAO, type CallScript } from '@/lib/call-script'

export const dynamic = 'force-dynamic'

/**
 * /api/call-script — roteiro de ligação do corretor logado.
 * GET  → { enabled, script } (sem roteiro salvo, devolve o padrão IUL)
 * PUT  → { enabled?, script? } salva opt-in e/ou roteiro editado
 *
 * Guardado em settings key `call_script:<buyerId>` (padrão user_notes) — sem migration.
 * O opt-in nasce DESLIGADO: apoio na ligação é escolha de cada corretor.
 */

const chave = (buyerId: string) => `call_script:${buyerId}`

async function ler(db: ReturnType<typeof createAdminClient>, buyerId: string) {
  try {
    const { data } = await db.from('settings').select('value').eq('key', chave(buyerId)).maybeSingle()
    const v = (data?.value as any) || {}
    return {
      enabled: v.enabled === true,
      script: (v.script && Array.isArray(v.script.etapas) && v.script.etapas.length > 0
        ? v.script : SCRIPT_IUL_PADRAO) as CallScript,
    }
  } catch {
    return { enabled: false, script: SCRIPT_IUL_PADRAO }
  }
}

export async function GET() {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Estado do add-on IA na Ligação + uso do mês (franquia fair-use de 600 min).
  // Cortesia legada (call_transcription.buyers) conta como ativo — mesma regra do gate.
  let ia: { ativa: boolean; minutos: number; ligacoes: number; franquia: number } = { ativa: false, minutos: 0, ligacoes: 0, franquia: 600 }
  try {
    const mes = new Date().toISOString().slice(0, 7)
    const { data } = await db.from('settings').select('key, value')
      .in('key', ['ia_ligacao_addon', 'call_transcription', `ia_uso:${caller.id}:${mes}`])
    const mapa = Object.fromEntries((data || []).map(r => [r.key, r.value as any]))
    const cortesia: string[] = mapa.call_transcription?.buyers || []
    ia.ativa = !!mapa.ia_ligacao_addon?.[caller.id]?.active || cortesia.includes(caller.id)
    const uso = mapa[`ia_uso:${caller.id}:${mes}`] || {}
    ia.minutos = uso.minutos || 0
    ia.ligacoes = uso.ligacoes || 0
  } catch { /* painel degrada sem quebrar o roteiro */ }

  return NextResponse.json({ ...(await ler(db, caller.id)), ia })
}

export async function PUT(request: NextRequest) {
  const db = createAdminClient()
  const caller = await callerBuyer(db)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))

  const atual = await ler(db, caller.id)
  const novo: { enabled: boolean; script: CallScript } = {
    enabled: typeof body.enabled === 'boolean' ? body.enabled : atual.enabled,
    script: atual.script,
  }

  if (body.script) {
    const s = body.script as CallScript
    const etapasOk = Array.isArray(s?.etapas) && s.etapas.length > 0 && s.etapas.every(e =>
      e && typeof e.titulo === 'string' && e.titulo.trim() && Array.isArray(e.falas))
    if (!etapasOk) return NextResponse.json({ error: 'Roteiro inválido: cada etapa precisa de título e falas.' }, { status: 400 })
    novo.script = {
      nome: String(s.nome || 'Meu roteiro').slice(0, 80),
      etapas: s.etapas.slice(0, 30).map((e, i) => ({
        id: String(e.id || `etapa-${i + 1}`).slice(0, 40),
        titulo: String(e.titulo).slice(0, 120),
        objetivo: String(e.objetivo || '').slice(0, 200),
        falas: e.falas.slice(0, 20).map(f => String(f).slice(0, 600)),
        escutas: Array.isArray(e.escutas) ? e.escutas.slice(0, 10).map(x => String(x).slice(0, 200)) : undefined,
        gatilho: e.gatilho ? String(e.gatilho).slice(0, 200) : undefined,
      })),
      updated_at: new Date().toISOString(),
    }
  }

  const { error } = await db.from('settings').upsert(
    { key: chave(caller.id), value: novo, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ...novo })
}
