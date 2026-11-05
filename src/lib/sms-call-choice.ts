import type { createAdminClient } from './supabase/admin'

/**
 * SMS pós-ligação PERSONALIZÁVEL (05/11/2026). Decide O QUE o sistema faz quando uma ligação termina sem contato.
 * Só escolhe texto / pula. Janela 8h–21h, 1 SMS/dia, 14 no total, STOP e cancelamento por resposta continuam
 * em lib/sms-auto.ts e não passam por aqui.
 */
type Db = ReturnType<typeof createAdminClient>

export const SMS_TEMPLATE_MAX = 320
export const SMS_CHOICE_MAX_AGE_MS = 30 * 60_000 // a escolha vale para a ligação em curso, não para sempre
export type SmsChoiceMode = 'default' | 'off' | 'template'
export type SmsChoice = { mode: SmsChoiceMode; template_id: string | null; updated_at: string }
export type SmsTemplateRow = { id: string; body: string; is_default: boolean }
export type SmsPlan =
  | { kind: 'skip'; why: 'buyer_off' | 'call_off' }
  | { kind: 'default' }
  | { kind: 'template'; templateId: string; body: string }

/** Decisão pura (testável): chave geral > escolha desta ligação (se recente) > modelo padrão do comprador > texto do sistema. */
export function pickSmsPlan(i: { autoEnabled: boolean; choice: SmsChoice | null; templates: SmsTemplateRow[]; now?: number }): SmsPlan {
  if (!i.autoEnabled) return { kind: 'skip', why: 'buyer_off' }
  const now = i.now ?? Date.now()
  const at = i.choice ? Date.parse(i.choice.updated_at) : NaN
  const fresh = i.choice && Number.isFinite(at) && now - at >= 0 && now - at <= SMS_CHOICE_MAX_AGE_MS
  if (fresh && i.choice!.mode === 'off') return { kind: 'skip', why: 'call_off' }
  if (fresh && i.choice!.mode === 'template') {
    const t = i.templates.find(x => x.id === i.choice!.template_id)
    if (t) return { kind: 'template', templateId: t.id, body: t.body }
    // modelo apagado no meio da ligação → cai no padrão, nunca em silêncio nem em texto vazio
  }
  const def = i.templates.find(x => x.is_default)
  return def ? { kind: 'template', templateId: def.id, body: def.body } : { kind: 'default' }
}

/** Variáveis aceitas no texto. Qualquer outra chave {…} é recusada para não sair "{xyz}" cru na mensagem do lead. */
export const SMS_VARIABLES = ['{nome}', '{corretor}'] as const

export function validateSmsTemplate(input: { name?: unknown; body?: unknown }): { ok: true; name: string; body: string } | { ok: false; error: string } {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  if (!name || name.length > 60) return { ok: false, error: 'Nome obrigatório (até 60 caracteres).' }
  if (!body) return { ok: false, error: 'Escreva o texto da mensagem.' }
  if (body.length > SMS_TEMPLATE_MAX) return { ok: false, error: `Texto muito longo (máximo ${SMS_TEMPLATE_MAX} caracteres).` }
  const unknown = (body.match(/\{[^{}]*\}/g) || []).filter(v => !(SMS_VARIABLES as readonly string[]).includes(v.toLowerCase()))
  if (unknown.length) return { ok: false, error: `Variável desconhecida: ${unknown[0]}. Use só {nome} e {corretor}.` }
  if (/[{}]/.test(body.replace(/\{[^{}]*\}/g, ''))) return { ok: false, error: 'Chaves { } soltas no texto.' }
  return { ok: true, name, body }
}

export function renderSmsTemplate(body: string, who: { leadName?: string | null; buyerName?: string | null; buyerFallback?: string }): string {
  const first = String(who.leadName || '').trim().split(/\s+/)[0] || ''
  return body.replace(/\{nome\}/gi, first).replace(/\{corretor\}/gi, (who.buyerName || '').trim() || who.buyerFallback || '').replace(/[ \t]{2,}/g, ' ').trim()
}

/** Lê chave geral, escolha da ligação e modelos. Qualquer falha de leitura (ex.: migration ainda não aplicada) = comportamento de hoje. */
export async function loadSmsPlan(db: Db, buyerId: string, leadId: string): Promise<SmsPlan> {
  try {
    let autoEnabled = true
    const b = await db.from('buyers').select('sms_auto_enabled').eq('id', buyerId).maybeSingle()
    if (!b.error && b.data && b.data.sms_auto_enabled === false) autoEnabled = false
    const [c, t] = await Promise.all([
      db.from('sms_call_choices').select('mode, template_id, updated_at').eq('buyer_id', buyerId).eq('lead_id', leadId).maybeSingle(),
      db.from('sms_templates').select('id, body, is_default').eq('buyer_id', buyerId),
    ])
    return pickSmsPlan({ autoEnabled, choice: c.error ? null : (c.data as SmsChoice | null), templates: t.error ? [] : (t.data as SmsTemplateRow[] | null) || [] })
  } catch {
    return { kind: 'default' }
  }
}

/** Aviso de opt-out no fim de todo SMS pós-ligação (05/11/2026, ordem do dono). Idioma do LEAD. */
const STOP_FOOTER: Record<'pt' | 'es' | 'en', string> = {
  pt: 'Responda STOP para parar.',
  es: 'Responde STOP para parar.',
  en: 'Reply STOP to stop.',
}

/** Idempotente: se o texto já tem "STOP" (re-tradução de agendado, modelo que já traz o aviso), não duplica. */
export function withStopFooter(body: string, locale: string): string {
  const text = String(body || '').trim()
  if (/\bSTOP\b/i.test(text)) return text
  const f = STOP_FOOTER[(locale === 'es' || locale === 'en') ? locale : 'pt']
  return text ? `${text}\n${f}` : text
}
