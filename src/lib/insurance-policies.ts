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

/** Locale das funções compartilhadas (default 'pt' — retrocompatível). */
export type PolicyLocale = 'pt' | 'en' | 'es'
const pick = (locale: PolicyLocale) => (pt: string, en: string, es: string) =>
  locale === 'en' ? en : locale === 'es' ? es : pt

export function BUCKETS(locale: PolicyLocale = 'pt'): { key: Bucket; label: string; icon: string; color: string; bg: string; hint: string }[] {
  const L = pick(locale)
  return [
    { key: 'urgente', label: L('Urgente', 'Urgent', 'Urgente'), icon: '🔴', color: '#b91c1c', bg: '#fef2f2',
      hint: L(
        'Dinheiro parado ou apólice prestes a cair. Se cair, você perde o cliente E a comissão volta (chargeback).',
        'Money on hold or a policy about to lapse. If it lapses, you lose the client AND the commission comes back (chargeback).',
        'Dinero detenido o póliza a punto de caer. Si cae, pierdes al cliente Y la comisión se devuelve (chargeback).') },
    { key: 'assinatura', label: L('Cobrar assinatura', 'Chase signature', 'Pedir firma'), icon: '🟠', color: '#b45309', bg: '#fffbeb',
      hint: L(
        'A apólice foi emitida, mas falta o cliente assinar (eDelivery, recibo, alteração). Sem isso a entrega não conclui.',
        'The policy was issued, but the client still needs to sign (eDelivery, receipt, amendment). Without it, delivery is not complete.',
        'La póliza fue emitida, pero falta que el cliente firme (eDelivery, recibo, enmienda). Sin eso la entrega no se completa.') },
    { key: 'nao_processada', label: L('Não processadas', 'Not processed', 'Sin procesar'), icon: '📤', color: '#4f46e5', bg: '#eef2ff',
      hint: L(
        'Enviadas para a seguradora e ainda sem retorno. Acima de 5 dias, é hora de cobrar.',
        'Submitted to the carrier with no response yet. Past 5 days, it is time to follow up.',
        'Enviadas a la aseguradora y todavía sin respuesta. Pasados 5 días, es hora de dar seguimiento.') },
    { key: 'acompanhar', label: L('Acompanhar', 'Follow up', 'Dar seguimiento'), icon: '🔵', color: '#0369a1', bg: '#f0f9ff',
      hint: L(
        'Emitidas aguardando ativar — confirmar 1º pagamento e vigência.',
        'Issued and waiting to activate — confirm the first payment and effective date.',
        'Emitidas en espera de activarse — confirma el primer pago y la fecha de vigencia.') },
    { key: 'em_dia', label: L('Em dia', 'In good standing', 'Al día'), icon: '✅', color: '#047857', bg: '#ecfdf5',
      hint: L(
        'Ativas e sem pendência. Momento de pedir indicação e revisar cobertura.',
        'Active with nothing pending. A good time to ask for referrals and review coverage.',
        'Activas y sin pendientes. Buen momento para pedir referidos y revisar la cobertura.') },
    { key: 'encerrada', label: L('Recuperar', 'Win back', 'Recuperar'), icon: '⚪', color: '#64748b', bg: '#f8fafc',
      hint: L(
        'Caducadas, canceladas ou recusadas — vale uma tentativa de recuperação.',
        'Lapsed, cancelled or declined — worth a win-back attempt.',
        'Caducadas, canceladas o rechazadas — vale la pena intentar recuperarlas.') },
  ]
}

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
export function acaoSugerida(p: Policy, locale: PolicyLocale = 'pt'): string {
  if (p.next_action) return p.next_action
  const L = pick(locale)
  const b = bucketOf(p)
  const venceEm = diasAte(p.due_date)
  const divida = p.amount_due_cents ? `$${(p.amount_due_cents / 100).toFixed(2)}` : null
  if (b === 'urgente') {
    if (divida && venceEm !== null) return L(
      `Ligar e cobrar o pagamento de ${divida} — prazo em ${venceEm} dia(s).`,
      `Call and collect the ${divida} payment — due in ${venceEm} day(s).`,
      `Llamar y cobrar el pago de ${divida} — vence en ${venceEm} día(s).`)
    if (divida) return L(
      `Ligar e cobrar o pagamento de ${divida}.`,
      `Call and collect the ${divida} payment.`,
      `Llamar y cobrar el pago de ${divida}.`)
    return L('Apólice em risco — falar com o cliente hoje.',
      'Policy at risk — talk to the client today.',
      'Póliza en riesgo — habla con el cliente hoy.')
  }
  if (b === 'assinatura') {
    const req = (p.requirements || []).join(', ')
    const d = diasDesde(p.issued_at)
    return L(
      `Cobrar assinatura${req ? `: ${req}` : ''}${d !== null ? ` — parado há ${d} dia(s)` : ''}.`,
      `Chase the signature${req ? `: ${req}` : ''}${d !== null ? ` — stalled for ${d} day(s)` : ''}.`,
      `Pedir la firma${req ? `: ${req}` : ''}${d !== null ? ` — detenido hace ${d} día(s)` : ''}.`)
  }
  if (b === 'nao_processada') {
    const d = diasDesde(p.submitted_at)
    return L(
      `Cobrar a seguradora — ${d} dia(s) sem processar a aplicação.`,
      `Follow up with the carrier — ${d} day(s) without processing the application.`,
      `Dar seguimiento a la aseguradora — ${d} día(s) sin procesar la aplicación.`)
  }
  if (b === 'acompanhar') return L('Confirmar o primeiro pagamento e a data de vigência.',
    'Confirm the first payment and the effective date.',
    'Confirmar el primer pago y la fecha de vigencia.')
  if (b === 'em_dia') return L('Em dia. Boa hora para pedir indicação ou revisar a cobertura.',
    'In good standing. A good time to ask for referrals or review coverage.',
    'Al día. Buen momento para pedir referidos o revisar la cobertura.')
  return L('Tentar recuperar o cliente.', 'Try to win the client back.', 'Intentar recuperar al cliente.')
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
  const porBucket = BUCKETS().reduce((acc, b) => ({ ...acc, [b.key]: 0 }), {} as Record<Bucket, number>)
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

export function STATUS_LABEL(locale: PolicyLocale = 'pt'): Record<PolicyStatus, string> {
  const L = pick(locale)
  return {
    submitted: L('Enviada', 'Submitted', 'Enviada'),
    issued: L('Emitida', 'Issued', 'Emitida'),
    active: L('Ativa', 'Active', 'Activa'),
    at_risk: L('Em risco', 'At risk', 'En riesgo'),
    lapsed: L('Caducada', 'Lapsed', 'Caducada'),
    cancelled: L('Cancelada', 'Cancelled', 'Cancelada'),
    declined: L('Recusada', 'Declined', 'Rechazada'),
  }
}

export function REQUISITOS_COMUNS(locale: PolicyLocale = 'pt'): string[] {
  const L = pick(locale)
  return ['eDelivery', 'Policy Receipt', 'Amendment', 'ID Verification', 'Illustration',
    L('Exame médico', 'Medical exam', 'Examen médico'), L('1º prêmio', '1st premium', '1er pago')]
}
