/**
 * GESTÃO DE APÓLICES (pós-venda) — 2026-08-03.
 *
 * Traz pro CRM o modelo do "Status do Book" que o dono já usava por fora: a apólice
 * não é um registro parado — ela é classificada num BUCKET DE AÇÃO calculado a partir
 * de datas e pendências, para o corretor saber o que fazer hoje e não perder comissão.
 *
 * Buckets (prioridade decrescente):
 *  🔴 urgente        — aviso de lapse / dívida vencendo: se cair, perde cliente E comissão
 *  🟠 assinatura     — emitida mas o cliente não assinou (eDelivery, Policy Receipt, Amendment)
 *  📤 nao_processada — enviada no eApp e a seguradora ainda não processou (>5 dias)
 *  🔵 acompanhar     — emitida sem pendência conhecida, aguardando ativar
 *  ✅ em_dia         — ativa e sem pendência
 *  ⚪ encerrada      — caducada/cancelada/recusada (recuperar)
 */

export type PolicyStatus = 'submitted' | 'issued' | 'active' | 'at_risk' | 'lapsed' | 'cancelled' | 'declined'
export type Bucket = 'urgente' | 'assinatura' | 'nao_processada' | 'acompanhar' | 'em_dia' | 'encerrada'

export interface Policy {
  id: string
  buyer_id: string
  lead_id: string | null
  client_name: string
  client_phone: string | null
  client_email: string | null
  policy_number: string | null
  carrier: string | null
  product: string | null
  coverage_cents: number | null
  premium_cents: number | null
  premium_mode: string | null
  status: PolicyStatus
  submitted_at: string | null
  issued_at: string | null
  effective_date: string | null
  paid_through: string | null
  requirements: string[] | null
  amount_due_cents: number | null
  due_date: string | null
  next_action: string | null
  notes: string | null
  beneficiary: string | null
  last_contact_at: string | null
  done_at: string | null
  created_at: string
  updated_at: string
}

export const BUCKETS: { key: Bucket; label: string; icon: string; color: string; bg: string; hint: string }[] = [
  { key: 'urgente', label: 'Urgente', icon: '🔴', color: '#b91c1c', bg: '#fef2f2',
    hint: 'Dinheiro parado ou apólice prestes a cair. Se cair, você perde o cliente E a comissão volta (chargeback).' },
  { key: 'assinatura', label: 'Cobrar assinatura', icon: '🟠', color: '#b45309', bg: '#fffbeb',
    hint: 'A apólice foi emitida, mas falta o cliente assinar (eDelivery, recibo, alteração). Sem isso a entrega não conclui.' },
  { key: 'nao_processada', label: 'Não processadas', icon: '📤', color: '#4f46e5', bg: '#eef2ff',
    hint: 'Enviadas para a seguradora e ainda sem retorno. Acima de 5 dias, é hora de cobrar.' },
  { key: 'acompanhar', label: 'Acompanhar', icon: '🔵', color: '#0369a1', bg: '#f0f9ff',
    hint: 'Emitidas aguardando ativar — confirmar 1º pagamento e vigência.' },
  { key: 'em_dia', label: 'Em dia', icon: '✅', color: '#047857', bg: '#ecfdf5',
    hint: 'Ativas e sem pendência. Momento de pedir indicação e revisar cobertura.' },
  { key: 'encerrada', label: 'Recuperar', icon: '⚪', color: '#64748b', bg: '#f8fafc',
    hint: 'Caducadas, canceladas ou recusadas — vale uma tentativa de recuperação.' },
]

const DIA = 86400_000
export function diasDesde(d?: string | null): number | null {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d + 'T12:00:00').getTime()) / DIA)
}
export function diasAte(d?: string | null): number | null {
  if (!d) return null
  return Math.ceil((new Date(d + 'T12:00:00').getTime() - Date.now()) / DIA)
}

/** Bucket calculado (nunca guardado — sempre reflete a realidade das datas). */
export function bucketOf(p: Policy): Bucket {
  if (p.status === 'lapsed' || p.status === 'cancelled' || p.status === 'declined') return 'encerrada'

  const venceEm = diasAte(p.due_date)
  const temDivida = (p.amount_due_cents || 0) > 0
  if (p.status === 'at_risk' || temDivida || (venceEm !== null && venceEm <= 30)) return 'urgente'

  const pend = (p.requirements || []).filter(Boolean)
  if (p.status === 'issued' && pend.length > 0) return 'assinatura'
  if (p.status === 'submitted') {
    const d = diasDesde(p.submitted_at)
    return d !== null && d > 5 ? 'nao_processada' : 'acompanhar'
  }
  if (p.status === 'issued') return 'acompanhar'
  if (p.status === 'active') return pend.length > 0 ? 'assinatura' : 'em_dia'
  return 'acompanhar'
}

/** Frase de ação sugerida quando o corretor não escreveu uma. */
export function acaoSugerida(p: Policy): string {
  if (p.next_action) return p.next_action
  const b = bucketOf(p)
  const venceEm = diasAte(p.due_date)
  const divida = p.amount_due_cents ? `$${(p.amount_due_cents / 100).toFixed(2)}` : null
  if (b === 'urgente') {
    if (divida && venceEm !== null) return `Ligar e cobrar o pagamento de ${divida} — prazo em ${venceEm} dia(s).`
    if (divida) return `Ligar e cobrar o pagamento de ${divida}.`
    return 'Apólice em risco — falar com o cliente hoje.'
  }
  if (b === 'assinatura') {
    const req = (p.requirements || []).join(', ')
    const d = diasDesde(p.issued_at)
    return `Cobrar assinatura${req ? `: ${req}` : ''}${d !== null ? ` — parado há ${d} dia(s)` : ''}.`
  }
  if (b === 'nao_processada') {
    const d = diasDesde(p.submitted_at)
    return `Cobrar a seguradora — ${d} dia(s) sem processar a aplicação.`
  }
  if (b === 'acompanhar') return 'Confirmar o primeiro pagamento e a data de vigência.'
  if (b === 'em_dia') return 'Em dia. Boa hora para pedir indicação ou revisar a cobertura.'
  return 'Tentar recuperar o cliente.'
}

/** Ordena por urgência real dentro do bucket (prazo mais curto / parado há mais tempo). */
export function ordenar(a: Policy, b: Policy): number {
  const pa = diasAte(a.due_date) ?? 9999
  const pb = diasAte(b.due_date) ?? 9999
  if (pa !== pb) return pa - pb
  const da = diasDesde(a.issued_at || a.submitted_at) ?? -1
  const db = diasDesde(b.issued_at || b.submitted_at) ?? -1
  return db - da
}

export interface PolicyKpis {
  total: number
  ativas: number
  pendentes: number   // com documento/pendência
  emRisco: number     // caducadas ou caindo
  premioMensalCents: number
  coberturaCents: number
  porBucket: Record<Bucket, number>
}

export function kpisDe(lista: Policy[]): PolicyKpis {
  const porBucket = BUCKETS.reduce((acc, b) => ({ ...acc, [b.key]: 0 }), {} as Record<Bucket, number>)
  let ativas = 0, pendentes = 0, emRisco = 0, premio = 0, cobertura = 0
  for (const p of lista) {
    const b = bucketOf(p)
    porBucket[b]++
    if (p.status === 'active') { ativas++; premio += p.premium_cents || 0; cobertura += p.coverage_cents || 0 }
    if ((p.requirements || []).length > 0) pendentes++
    if (b === 'urgente' || p.status === 'lapsed') emRisco++
  }
  return { total: lista.length, ativas, pendentes, emRisco, premioMensalCents: premio, coberturaCents: cobertura, porBucket }
}

export const money = (cents?: number | null) =>
  cents == null ? '—' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`

export const STATUS_LABEL: Record<PolicyStatus, string> = {
  submitted: 'Enviada', issued: 'Emitida', active: 'Ativa', at_risk: 'Em risco',
  lapsed: 'Caducada', cancelled: 'Cancelada', declined: 'Recusada',
}

export const REQUISITOS_COMUNS = ['eDelivery', 'Policy Receipt', 'Amendment', 'ID Verification', 'Illustration', 'Exame médico', '1º prêmio']
