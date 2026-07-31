import { createAdminClient } from './supabase/admin'
import { notifyAdmins } from './notifications'

/**
 * LIMITADOR DE ENVIO POR CONTA (incidente 2026-07-31).
 *
 * Uma conta disparou 2.526 mensagens do mesmo template pra 85 leads (193 delas com
 * menos de 1s de intervalo, o mesmo lead recebendo 17x) — spam nos leads do cliente e
 * a sessão do WhatsApp dele caiu. Seja qual for a origem (loop de tela, script externo,
 * clique repetido), o sistema NÃO pode deixar isso passar de novo.
 *
 * Teto por comprador, contado nas mensagens de saída já registradas:
 *   15/minuto · 120/hora · 400/dia   (ajustável em settings.send_limits, sem deploy)
 * Estourou → envio bloqueado (429) + aviso no WhatsApp do admin (no máx. 1 por hora
 * por conta, pra não virar flood de alerta).
 *
 * Corretor trabalhando manda ~20-40 msgs/hora — os limites são folgados pra uso real
 * e apertados o suficiente pra matar qualquer rajada de máquina.
 */

const PADRAO = { perMinute: 15, perHour: 120, perDay: 400 }

type Db = ReturnType<typeof createAdminClient>

export interface SendGuardResult {
  ok: boolean
  reason?: string
  janela?: 'minuto' | 'hora' | 'dia'
  count?: number
  limit?: number
}

async function limites(db: Db) {
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'send_limits').maybeSingle()
    const v = (data?.value as any) || {}
    return {
      perMinute: Number(v.perMinute) > 0 ? Number(v.perMinute) : PADRAO.perMinute,
      perHour: Number(v.perHour) > 0 ? Number(v.perHour) : PADRAO.perHour,
      perDay: Number(v.perDay) > 0 ? Number(v.perDay) : PADRAO.perDay,
    }
  } catch { return PADRAO }
}

async function contar(db: Db, buyerId: string, desdeISO: string): Promise<number> {
  const { count } = await db.from('whatsapp_messages')
    .select('*', { count: 'exact', head: true })
    .eq('buyer_id', buyerId).eq('direction', 'out').gte('sent_at', desdeISO)
  return count || 0
}

/** Avisa o admin no máximo 1x/hora por conta (trava em settings). */
async function alertarUmaVez(db: Db, buyerId: string, msg: string) {
  try {
    const { data } = await db.from('settings').select('value').eq('key', 'send_guard_alerts').maybeSingle()
    const mapa = ((data?.value as any) || {}) as Record<string, string>
    const ultimo = mapa[buyerId] ? new Date(mapa[buyerId]).getTime() : 0
    if (Date.now() - ultimo < 3600_000) return
    mapa[buyerId] = new Date().toISOString()
    await db.from('settings').upsert({ key: 'send_guard_alerts', value: mapa, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    await notifyAdmins(msg)
  } catch (e: any) { console.error('[send-guard] alerta falhou:', e?.message) }
}

/**
 * Checa se o comprador pode enviar AGORA. Chamar antes de qualquer envio de WhatsApp
 * (tela, template, sequência, automação). Nunca lança — em erro, libera o envio
 * (não travar o negócio por falha do próprio guard).
 */
export async function checkSendRate(db: Db, buyerId: string): Promise<SendGuardResult> {
  if (!buyerId) return { ok: true }
  try {
    const lim = await limites(db)
    const agora = Date.now()
    const [min, hora, dia] = await Promise.all([
      contar(db, buyerId, new Date(agora - 60_000).toISOString()),
      contar(db, buyerId, new Date(agora - 3600_000).toISOString()),
      contar(db, buyerId, new Date(agora - 86400_000).toISOString()),
    ])

    const estouro =
      min >= lim.perMinute ? { janela: 'minuto' as const, count: min, limit: lim.perMinute } :
      hora >= lim.perHour ? { janela: 'hora' as const, count: hora, limit: lim.perHour } :
      dia >= lim.perDay ? { janela: 'dia' as const, count: dia, limit: lim.perDay } : null

    if (!estouro) return { ok: true }

    const { data: b } = await db.from('buyers').select('name, email').eq('id', buyerId).maybeSingle()
    console.error(`[send-guard] BLOQUEADO ${b?.name || buyerId}: ${estouro.count} envios/${estouro.janela} (limite ${estouro.limit})`)
    await alertarUmaVez(db, buyerId,
      `🛑 *ENVIO BLOQUEADO (limite de segurança)*\n\n👤 ${b?.name || buyerId}\n📧 ${b?.email || ''}\n` +
      `📊 ${estouro.count} mensagens na última ${estouro.janela} (limite ${estouro.limit})\n\n` +
      `O disparo foi interrompido automaticamente. Verifique se é uso legítimo ou repetição indevida.`)

    return {
      ok: false, janela: estouro.janela, count: estouro.count, limit: estouro.limit,
      reason: `Limite de segurança atingido: ${estouro.count} mensagens na última ${estouro.janela} (máximo ${estouro.limit}). ` +
        `Isso protege seu número de bloqueio pelo WhatsApp. Aguarde alguns minutos e tente de novo.`,
    }
  } catch (e: any) {
    console.error('[send-guard] erro (liberando):', e?.message)
    return { ok: true }
  }
}
